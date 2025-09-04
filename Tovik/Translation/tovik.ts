import TovikNode from './TovikNode.js';
import TovikLanguageElement from './TovikLanguageElement.js';
import TovikElement from './TovikElement.js';
import TovikEngine from './TovikEngine.js';

// do an initial ping to Sparc Engine to set the cookie
TovikEngine.hi().then(() => {
    customElements.define('tovik-t', TovikNode);
    customElements.define('tovik-language', TovikLanguageElement);
    customElements.define('tovik-translate', TovikElement);

    // If the document does not have a <tovik-translate> element, create one and point it to the body
    if (!document.querySelector('tovik-translate')) {
        var bodyElement = document.createElement('tovik-translate');
        bodyElement.setAttribute('for', 'body');
        document.body.appendChild(bodyElement);
    }
});

// Waits for the event to inject the language selector
document.addEventListener('tovik-domain-settings', (e: any) => {
    const settings = e.detail;
    if (settings && settings.languageSelectorPosition && settings.languageSelectorPosition !== 'none') {
        if (!document.querySelector('tovik-language[floating="true"]')) {
            const langEl = document.createElement('tovik-language');
            langEl.setAttribute('floating', 'true');
            langEl.setAttribute('position', settings.languageSelectorPosition);
            if (settings.languageSelectorThemeColor) {
                langEl.setAttribute('theme-color', settings.languageSelectorThemeColor);
            }
            document.body.appendChild(langEl);
        }
    }
});