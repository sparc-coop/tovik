import db from './TovikDb.js';
import TovikEngine from './TovikEngine.js';

export default class TovikNode extends HTMLElement {
    #original;
    #originalLang;
    #translated;

    constructor() {
        super();
    }

    connectedCallback() {
        this.#original = this.textContent.trim();
        this.#originalLang = this.lang || document.documentElement.lang;

        document.addEventListener('tovik-language-changed', this.#languageChangedCallback);
        this.askForTranslation();
    }

    disconnectedCallback() {
        document.removeEventListener('tovik-language-changed', this.#languageChangedCallback);
    }

    #languageChangedCallback = (event: any) => {
        this.askForTranslation();
    }

    askForTranslation() {
        const hash = TovikEngine.idHash(this.#original);
        db.translations.get(hash).then(translation => {
            if (translation) {
                this.render(translation);
            } else {
                this.classList.add('tovik-translating');
                TovikEngine.translate(this.#original, this.#originalLang)
                    .then(newTranslation => {
                        this.render(newTranslation);
                        db.translations.put(newTranslation);
                    });
                this.classList.remove('tovik-translating');
            }
        });
    }

    render(translation) {
        this.#translated = translation.text;

        if (this.#translated) {
            this.textContent = this.#translated;
        } else {
            this.textContent = this.#original;
        }
    }
}