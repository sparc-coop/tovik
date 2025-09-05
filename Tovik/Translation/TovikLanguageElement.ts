import db from './TovikDb.js';
import TovikEngine from './TovikEngine.js';

export default class TovikLanguageElement extends HTMLElement {
    private root: ShadowRoot;
    private selectEl?: HTMLSelectElement;
    private roundEl?: HTMLDivElement;
    private showingSelect = false;

    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
        this.applyStyleFromAttributes();
        this.getLanguages();

        const observer = new MutationObserver(() => this.applyStyleFromAttributes());
        observer.observe(this, { attributes: true, attributeFilter: ['theme-color', 'position', 'floating'] });

        document.addEventListener('pointerdown', this.onGlobalPointerDown, true);
        document.addEventListener('keydown', this.onGlobalKeyDown, true);
    }

    disconnectedCallback() {
        document.removeEventListener('pointerdown', this.onGlobalPointerDown, true);
        document.removeEventListener('keydown', this.onGlobalKeyDown, true);
    }

    private render() {
        const style = document.createElement('style');
        style.textContent = `
:host {
  --tovik-theme-color: #333333;
  --tovik-text-color: #ffffff;
  --tovik-shadow: 0 6px 18px rgba(0,0,0,0.18);
  all: initial;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
}

:host([floating="true"]) {
  position: fixed !important;
  z-index: 2147483647 !important;
  bottom: 20px;
}
:host([floating="true"][position="bottomleft"]) { left: 20px; }
:host([floating="true"][position="bottomright"]) { right: 20px; }

.wrapper {
  display: inline-flex;
  align-items: center;
}

.round {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: var(--tovik-theme-color);
  color: var(--tovik-text-color);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  box-shadow: var(--tovik-shadow);
}

.round:focus-visible {
  outline: 2px solid rgba(255,255,255,0.6);
  outline-offset: 2px;
}

select {
  all: initial;
  font: 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
  color: var(--tovik-text-color);
  background: var(--tovik-theme-color);
  border: none;
  padding: 6px 8px;
  border-radius: 8px;
  box-shadow: var(--tovik-shadow);
  cursor: pointer;
}
select option {
  background: var(--tovik-theme-color);
  color: var(--tovik-text-color);
}
select:focus {
  outline: 2px solid rgba(255,255,255,0.6);
  outline-offset: 2px;
}

        `;

        const wrapper = document.createElement('div');
        wrapper.className = 'wrapper';

        const round = document.createElement('div');
        round.className = 'round';
        round.setAttribute('role', 'button');
        round.setAttribute('tabindex', '0');
        round.setAttribute('aria-haspopup', 'listbox');
        round.setAttribute('aria-expanded', 'false');
        round.addEventListener('click', () => this.showSelect());
        round.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.showSelect();
            }
        });
        this.roundEl = round;

        const select = document.createElement('select');
        select.style.display = 'none';
        select.addEventListener('change', () => {
            document.dispatchEvent(new CustomEvent('tovik-user-language-changed', { detail: select.value }));
            this.updateRoundLabel();
            this.showRound();
            this.roundEl?.focus();
        });
        this.selectEl = select;

        wrapper.append(round, select);
        this.root.innerHTML = '';
        this.root.append(style, wrapper);
    }

    private applyStyleFromAttributes() {
        const theme = this.getAttribute('theme-color');
        if (theme) {
            (this.root.host as HTMLElement).style.setProperty('--tovik-theme-color', theme);
            try {
                const hex = theme.replace('#', '');
                const rgb = (hex.length === 3)
                    ? hex.split('').map(h => parseInt(h + h, 16))
                    : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map(h => parseInt(h, 16));
                const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
                (this.root.host as HTMLElement).style.setProperty('--tovik-text-color', luma > 160 ? '#000000' : '#ffffff');
            } catch { /* ignore */ }
        }
    }

    private getLanguages() {
        db.languages.toArray().then(languages => {
            if (languages.length > 0) {
                this.renderLanguages(languages);
            } else {
                TovikEngine.getLanguages().then(langs => {
                    this.renderLanguages(langs);
                    db.languages.bulkPut(langs);
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
            if (lang.id === TovikEngine.userLang) option.selected = true;
            this.selectEl!.appendChild(option);
        });

        this.updateRoundLabel();

        document.addEventListener('tovik-language-set', (event: any) => {
            if (languages.some(l => l.id === event.detail)) {
                this.selectEl!.value = event.detail;
                this.updateRoundLabel();
                if (this.showingSelect) this.showRound(); 
            }
        });
    }

    private updateRoundLabel() {
        if (!this.roundEl || !this.selectEl) return;
        const id = (this.selectEl.value || TovikEngine.userLang || '').trim();
        this.roundEl.textContent = (id || '??').toUpperCase();
        this.roundEl.setAttribute('aria-label', `Selected language ${id}`);
    }

    private showSelect() {
        if (!this.selectEl || !this.roundEl) return;
        this.roundEl.style.display = 'none';
        this.selectEl.style.display = '';
        this.selectEl.focus();
        this.showingSelect = true;
        this.roundEl.setAttribute('aria-expanded', 'true');
    }

    private showRound() {
        if (!this.selectEl || !this.roundEl) return;
        this.selectEl.style.display = 'none';
        this.roundEl.style.display = '';
        this.showingSelect = false;
        this.roundEl.setAttribute('aria-expanded', 'false');
    }

    private onGlobalPointerDown = (ev: Event) => {
        const path = ev.composedPath();
        if (!path.includes(this.root.host) && this.showingSelect) {
            this.showRound();
        }
    };

    private onGlobalKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && this.showingSelect) this.showRound();
    };
}