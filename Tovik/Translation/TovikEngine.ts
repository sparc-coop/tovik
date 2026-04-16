import MD5 from "./MD5.js";
import db from './TovikDb.js';

const baseUrl = window.location.href.includes('localhost')
    || (window.parent?.location != null && window.parent.location.href.includes('localhost'))
    ? 'https://localhost:7185'
    : 'https://engine.sparc.coop';

console.log('urls', window.parent?.location?.href);

export default class TovikEngine {
    static userLang;
    static documentLang;
    static detectedLang;
    static model;
    static sampleText;
    static rtlLanguages = ['ar', 'fa', 'he', 'ur', 'ps', 'ku', 'dv', 'yi', 'sd', 'ug'];

    static async getUserLanguage() {
        // If query parameter lang is set, use it
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('lang')) {
            this.userLang = urlParams.get('lang');
            return this.userLang;
        }

        // Check for data-lang on the body element
        const htmlLang = document.body.getAttribute('data-toviklang');
        if (htmlLang) {
            this.model = 'Live';
            this.userLang = htmlLang;
            window.addEventListener('message', async (event) => {
                var lang = event['data'];
                if (lang && lang.startsWith && lang.startsWith('tovik-lang')) {
                    lang = lang.split(':')[1];
                    await this.setLanguage(lang);
                } else if (event['data'] == 'tovik-forcereload') {
                    await db.translations.clear();
                    window.location.reload();
                }
            });

            return this.userLang;
        }

        if (this.userLang)
            return this.userLang;

        var tovikLang = await localStorage.getItem('tovik-lang');
        if (tovikLang) {
            this.userLang = tovikLang;
        } else {
            this.userLang = navigator.language;
            await localStorage.setItem('tovik-lang', this.userLang);
        }
        return this.userLang;
    }

    static injectPreloadCSS() {
        const style = document.createElement('style');
        style.textContent = 'html.tovik-translating, html.tovik-translating * { color: transparent !important; caret-color: transparent !important; }';
        document.head.appendChild(style);
    }

    static isRegisteringVisit = false;
    static async registerVisit() {
        if (this.isRegisteringVisit || !this.sampleText || this.sampleText.length < 100)
            return;

        this.isRegisteringVisit = true;

        this.fetch('translate/visit', {
            Domain: window.location.host,
            SpaceId: window.location.pathname,
            LanguageId: this.documentLang,
            Language: { Id: this.documentLang },
            Text: this.sampleText.substring(0, 1000)
        }).then(x => {
            this.detectedLang = x.id;
            this.isRegisteringVisit = false;
        });
    }


    static async hi() {
        this.injectPreloadCSS();

        let lang = await this.getUserLanguage();
        this.documentLang = document.documentElement.lang;

        await this.setLanguage(lang);
        document.addEventListener('tovik-user-language-changed', async (event: CustomEvent) => {
            await this.setLanguage(event.detail);
        });
    }

    static async getLanguages() {
        return await this.fetch('translate/languages');
    }

    static async setLanguage(language) {
        if (this.userLang != language) {
            if (!document.body.getAttribute('data-toviklang'))
                await localStorage.setItem('tovik-lang', language);

            this.userLang = language;
            document.dispatchEvent(new CustomEvent('tovik-language-changed', { detail: this.userLang }));
        }

        document.dispatchEvent(new CustomEvent('tovik-language-set', { detail: this.userLang }));
        document.documentElement.lang = this.userLang;
        document.documentElement.setAttribute('dir', this.rtlLanguages.some(x => this.userLang.startsWith(x)) ? 'rtl' : 'ltr');
    }

    static idHash(text, lang = null) {
        if (!lang)
            lang = this.userLang;

        return MD5(text.trim() + ':' + lang);
    }

    static async translate(text, fromLang) {
        const request = {
            id: this.idHash(text, fromLang),
            Domain: window.location.host,
            SpaceId: window.location.pathname,
            LanguageId: fromLang,
            Language: { Id: fromLang },
            Text: text
        };

        return await this.fetch('translate', request, this.userLang);
    }

    static async getFromCache(items, fromLang) {
        const requests = items.map(item => TovikEngine.toRequest(item, fromLang));

        if (!this.userLang) {
            await this.getUserLanguage();
        }

        var result = await this.fetch('translate/all', requests, this.userLang);
        return result;
    }

    static getWindowedSample(firstItem, lastItem, totalChars) {
        if (!this.sampleText)
            return '';

        var text = this.sampleText;

        const firstItemIndex = text.indexOf(firstItem.text);
        const lastItemIndex = text.indexOf(lastItem.text);
        const numSamples = firstItemIndex > -1 && lastItemIndex > -1
            ? lastItemIndex - firstItemIndex > totalChars ? 2 : 1
            : firstItemIndex > -1 || lastItemIndex > -1 ? 1
                : 0;
        let sample;

        if (numSamples === 0) {
            sample = text.substring(0, totalChars);
        } else if (numSamples == 2) {
            const firstStartIndex = Math.max(0, firstItemIndex - totalChars / 4);
            const firstEndIndex = Math.min(text.length, firstItemIndex + totalChars / 4);
            const lastStartIndex = Math.max(0, lastItemIndex - totalChars / 4);
            const lastEndIndex = Math.min(text.length, lastItemIndex + totalChars / 4);
            sample = text.substring(firstStartIndex, firstEndIndex) + text.substring(lastStartIndex, lastEndIndex);
        } else {
            var index = firstItemIndex > -1 ? firstItemIndex : lastItemIndex;
            let start = Math.max(0, index - totalChars / 2);
            let end = Math.min(text.length, index + totalChars / 2);

            // ensure we get as close to totalChars as possible
            if (end - start < totalChars) {
                start = Math.max(0, end - totalChars);
                end = Math.min(text.length, start + totalChars);
            }

            sample = text.substring(start, end);
        }

        return sample;
    }

    static async getUntranslated(items, fromLang) {
        if (!items.length)
            return [];

        const requests = items.map(item => TovikEngine.toRequest(item, fromLang));

        if (!this.userLang) {
            await this.getUserLanguage();
        }

        var windowedContext = this.getWindowedSample(items[0], items[items.length - 1], 1000);

        var result = await this.fetch('translate/untranslated', { content: requests, options: { additionalContext: windowedContext } }, this.userLang);
        return result;
    }

    static async translateAll(pendingTranslations, textMap, fromLang, onTranslation) {
        if (!pendingTranslations.length)
            return;

        var progress = document.querySelectorAll('.language-select-progress-bar');
        for (let i = 0; i < progress.length; i++) {
            progress[i].classList.add('show');
        }

        const uniqueMap = new Map();
        for (const item of pendingTranslations) {
            if (!uniqueMap.has(item.hash))
                uniqueMap.set(item.hash, { hash: item.hash, text: textMap(item.element) });
        }

        var textsToTranslate = Array.from(uniqueMap.values());

        const existingTranslations = await TovikEngine.getFromCache(textsToTranslate, fromLang);
        if (existingTranslations) {
            for (let translation of existingTranslations) {
                const pending = pendingTranslations.find(item => item.hash === translation.id);
                if (pending) {
                    onTranslation(pending.element, translation);
                    db.translations.put(translation);
                }
            }
        }

        const untranslated = textsToTranslate.filter(item => !existingTranslations.some(t => t.id === item.hash));
        const batches = [];
        const batchSize = 10;
        for (let i = 0; i < untranslated.length; i += batchSize) {
            batches.push(untranslated.slice(i, i + batchSize));
        }

        await Promise.all(batches.map(async batch => {
            let newTranslations = await TovikEngine.getUntranslated(batch, fromLang);
            if (!newTranslations)
                return;

            for (let translation of newTranslations) {
                const items = pendingTranslations.filter(item => item.hash === translation.id);
                for (let item of items) {
                    onTranslation(item.element, translation);
                    db.translations.put(translation);
                }
            }
        }));

        for (let i = 0; i < progress.length; i++) {
            progress[i].classList.remove('show');
        }
    }

    static toRequest(item, fromLang) {
        let domain = document.body.getAttribute('data-tovikdomain') ?? window.location.host;
        let path = document.body.getAttribute('data-tovikpath') ?? window.location.pathname;

        return {
            id: item.hash || this.idHash(item.text, fromLang),
            Domain: domain,
            SpaceId: path,
            LanguageId: fromLang,
            Language: { Id: fromLang },
            Text: item.text
        };
    };

    static async fetch(url: string, body: any = null, language: string = null) {
        const options: any = {
            credentials: 'include',
            method: body ? 'POST' : 'GET',
            headers: new Headers()
        };

        if (body) {
            if (this.model)
                body.model = this.model;

            options.headers.append('Content-Type', 'application/json');
            options.body = JSON.stringify(body);
        }

        if (language) {
            options.headers.append('Accept-Language', language);
        }

        const response = await fetch(`${baseUrl}/${url}`, options);

        if (response.ok)
            return await response.json();
        else if (response.status === 429) {
            console.warn(`Tovik tried to translate your site into ${language}, but your site has reached the Tovik translation limit!`);
        }
        else {
            console.error(`Tovik was unable to translate part of your site. Contact Tovik support to assist: Error code ${response.status}`);
        }
    }
}