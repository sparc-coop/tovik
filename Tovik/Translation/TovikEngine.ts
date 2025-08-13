import MD5 from "./MD5.js";
import db from './TovikDb.js';

const baseUrl = window.location.href.includes('localhost')
    ? 'https://localhost:7185'
    : 'https://engine.sparc.coop';

export default class TovikEngine {
    static userLang;
    static documentLang;
    static rtlLanguages = ['ar', 'fa', 'he', 'ur', 'ps', 'ku', 'dv', 'yi', 'sd', 'ug'];

    static async getUserLanguage() {
        // If query parameter lang is set, use it
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('lang')) {
            return urlParams.get('lang');
        }

        if (this.userLang)
            return this.userLang;

        var profile = await db.profiles.get('default');
        if (profile) {
            this.userLang = profile.language;
        } else {
            this.userLang = navigator.language;
            await db.profiles.add({ id: 'default', language: this.userLang });
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
            await db.profiles.put({ id: 'default', language: language });
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
            LanguageId: fromLang,
            Language: { Id: fromLang },
            Text: text
        };

        return await this.fetch('translate', request, this.userLang);
    }

    static async bulkTranslate(items, fromLang) {
        var progress = document.querySelectorAll('.language-select-progress-bar');
        for (let i = 0; i < progress.length; i++) {
            progress[i].classList.add('show');
        }

        const requests = items.map(item => ({
            id: item.hash || this.idHash(item.text, fromLang),
            Domain: window.location.host,
            LanguageId: fromLang,
            Language: { Id: fromLang },
            Text: item.text
        }));

        if (!this.userLang) {
            await this.getUserLanguage();
        }

        var result = await this.fetch('translate/bulk', requests, this.userLang);

        for (let i = 0; i < progress.length; i++) {
            progress[i].classList.remove('show');
        }

        return result;
    }

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