import MD5 from "./MD5.js";
import db from './TovikDb.js';

const baseUrl = true || window.location.href.includes('localhost')
    ? 'https://localhost:7185'
    : 'https://sparcengine-preview-gzbxcbaqayb4bkhz.centralus-01.azurewebsites.net';

export default class TovikEngine {
    static userLang;
    static documentLang;
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
            this.userLang = htmlLang;
            window.addEventListener('message', async (event) => {
                await this.setLanguage(event['data']);
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

    static async hi() {
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
            Path: window.location.pathname,
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

    static async getUntranslated(items, fromLang) {
        if (!items.length)
            return [];

        const requests = items.map(item => TovikEngine.toRequest(item, fromLang));

        if (!this.userLang) {
            await this.getUserLanguage();
        }

        var result = await this.fetch('translate/untranslated', { content: requests, additionalContext: document.body.innerText }, this.userLang);
        return result;
    }

    static async translateAll(pendingTranslations, textMap, fromLang, onTranslation) {
        if (!pendingTranslations.length)
                return;

        var progress = document.querySelectorAll('.language-select-progress-bar');
        for (let i = 0; i < progress.length; i++) {
            progress[i].classList.add('show');
        }

        var textsToTranslate = pendingTranslations.map(item => ({
            hash: item.hash,
            text: textMap(item.element)
        }));

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
        for (let i = 0; i < untranslated.length; i += 25) {
            batches.push(untranslated.slice(i, i + 25));
        }

        await Promise.all(batches.map(async batch => {
            let newTranslations = await TovikEngine.getUntranslated(batch, fromLang);
            for (let translation of newTranslations) {
                const item = pendingTranslations.find(item => item.hash === translation.id);
                if (item) {
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
            Path: path,
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