import db from './TovikDb.js';
import TovikEngine from './TovikEngine.js';

export default class TovikLanguageElement extends HTMLElement {
    private root: ShadowRoot | null = null;
    private selectEl?: HTMLSelectElement;

    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.renderSkeleton();
        this.applyStyleFromAttributes();
        this.getLanguages();

        const observer = new MutationObserver(() => this.applyStyleFromAttributes());
        observer.observe(this, { attributes: true, attributeFilter: ['theme-color', 'position'] });
    }

    private renderSkeleton() {
        if (!this.root) return;

        const style = document.createElement('style');
        style.textContent = `
:host {
  --tovik-theme-color: #333333;
  --tovik-text-color: #ffffff;
  --tovik-radius: 14px;
  --tovik-padding: 10px 12px;
  --tovik-gap: 8px;
  --tovik-shadow: 0 6px 18px rgba(0,0,0,0.18);
  all: initial; /* evita CSS do site interferir */
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
}

.wrapper {
  all: initial;
  display: inline-flex;
  align-items: center;
  gap: var(--tovik-gap);
  background: var(--tovik-theme-color);
  color: var(--tovik-text-color);
  border-radius: var(--tovik-radius);
  padding: var(--tovik-padding);
  box-shadow: var(--tovik-shadow);
  font-size: 14px;
  line-height: 1;
}

:host([floating="true"]) {
  position: fixed !important;
  z-index: 2147483647 !important;
  bottom: 20px;
}

:host([floating="true"][position="bottomleft"]) {
  left: 20px;
}

:host([floating="true"][position="bottomright"]) {
  right: 20px;
}

select {
  all: initial;
  appearance: none;
  background: transparent;
  color: inherit;
  font: inherit;
  border: none;
  padding: 0;
  cursor: pointer;
}

select:focus {
  outline: 2px solid rgba(255,255,255,0.6);
  outline-offset: 2px;
}
        `;

        const wrapper = document.createElement('div');
        wrapper.className = 'wrapper';

        const select = document.createElement('select');
        select.translate = false;
        this.selectEl = select;

        wrapper.appendChild(select);

        this.root.innerHTML = '';
        this.root.append(style, wrapper);
    }

    private applyStyleFromAttributes() {
        const theme = this.getAttribute('theme-color');
        if (theme && this.root) {

            (this.root.host as HTMLElement).style.setProperty('--tovik-theme-color', theme);

            try {
                const hex = theme.replace('#', '');
                if (hex.length === 3 || hex.length === 6) {
                    const rgb = hex.length === 3
                        ? hex.split('').map(h => parseInt(h + h, 16))
                        : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map(h => parseInt(h, 16));
                    const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
                    const text = luma > 160 ? '#000000' : '#ffffff';
                    (this.root.host as HTMLElement).style.setProperty('--tovik-text-color', text);
                }
            } catch { }
        }
    }

    private getLanguages() {
        db.languages.toArray().then(languages => {
            if (languages.length > 0) {
                this.renderLanguages(languages);
            } else {
                TovikEngine.getLanguages().then(languages => {
                    this.renderLanguages(languages);
                    db.languages.bulkPut(languages);
                });
            }
        });
    }

    private renderLanguages(languages: any[]) {
        if (!this.selectEl) return;

        this.selectEl.innerHTML = '';

        languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.id;
            option.textContent = lang.nativeName;
            if (lang.id === TovikEngine.userLang) {
                option.selected = true;
            }
            this.selectEl!.appendChild(option);
        });

        document.addEventListener('tovik-language-set', (event: any) => {
            if (languages.some(l => l.id === event.detail))
                this.selectEl!.value = event.detail;
        });

        this.selectEl.addEventListener('change', () => {
            document.dispatchEvent(new CustomEvent('tovik-user-language-changed', { detail: this.selectEl!.value }));
        });
    }
}