import db from './TovikDb.js';
import TovikEngine from './TovikEngine.js';

export default class TovikElement extends HTMLElement {
    observer;
    forceReload = false;
    #observedElement;
    #originalLang;

    constructor() {
        super();
    }

    async connectedCallback() {
        this.#observedElement = this;
        this.#originalLang = this.lang || TovikEngine.documentLang;

        // if the attribute 'for' is set, observe the element with that selector
        if (this.hasAttribute('for')) {
            const selector = this.getAttribute('for');
            this.#observedElement = document.querySelector(selector);
        }

        await this.translatePage(this.#observedElement);

        document.addEventListener('tovik-language-changed', async (event: any) => {
            await this.translatePage(this.#observedElement, true);
        });

        document.addEventListener('tovik-content-changed', async (event: any) => {
            await this.translatePage(this.#observedElement);
        });


        this.observer = new MutationObserver(this.#observer);
        this.observer.observe(this.#observedElement, { childList: true, characterData: false, subtree: true });
    }

    disconnectedCallback() {
        if (this.observer)
            this.observer.disconnect();
    }

    async translatePage(element, forceReload = false) {
        // Only translate if the first two characters of originalLang don't match the first two characters of TovikEngine.userLang
        if (this.#originalLang && this.#originalLang.substring(0, 2) === TovikEngine.userLang.substring(0, 2) && !forceReload) {
            return;
        }

        await this.wrapTextNodes(element, forceReload);
        await this.translateAttribute(element, 'placeholder', forceReload);
    }

    async wrapTextNodes(element, forceReload = false) {
        var nodes = [];
        var treeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, forceReload ? this.#tovikForceReloadIgnoreFilter : this.#tovikIgnoreFilter);
        while (treeWalker.nextNode()) {
            const node = treeWalker.currentNode;
            if (this.isValid(node)) {
                node['translating'] = true;
                nodes.push(node);
            }
        }
        
        await this.translateTextNodes(nodes);
    }

    isValid(node) {
        return node
            && node.textContent
            && /\p{Letter}/u.test(node.textContent) // Check if the text contains any letter
            && !(node.parentElement && node.parentElement.tagName === 'TOVIK-T');
    }

    #observer = mutations => {
        document.dispatchEvent(new CustomEvent('tovik-content-changed'));
    };

    #tovikIgnoreFilter = function (node) {
        var approvedNodes = ['#text'];

        if (!approvedNodes.includes(node.nodeName) || node.translating || node.translated || node.parentNode.nodeName == 'SCRIPT')
            return NodeFilter.FILTER_SKIP;

        var closest = node.parentElement.closest('[translate="no"]');
        if (closest)
            return NodeFilter.FILTER_SKIP;

        return NodeFilter.FILTER_ACCEPT;
    }

    #tovikForceReloadIgnoreFilter = function (node) {
        var approvedNodes = ['#text'];

        if (!approvedNodes.includes(node.nodeName) || node.parentNode.nodeName == 'SCRIPT')
            return NodeFilter.FILTER_SKIP;

        var closest = node.parentElement.closest('[translate="no"]');
        if (closest)
            return NodeFilter.FILTER_SKIP;

        return NodeFilter.FILTER_ACCEPT;
    }

    async translateAttribute(element:HTMLElement, attributeName:string, forceReload = false) {
        const elements = element.querySelectorAll('[' + attributeName + ']');
        let pendingTranslations = [];

        for (const el of elements) {
            const original = el['original-' + attributeName] || el.getAttribute(attributeName);
            if (!el['original-' + attributeName]) {
                el['original-' + attributeName] = original;
            }

            const hash = TovikEngine.idHash(original);
            const translation = await db.translations.get(hash);
            if (translation && !forceReload) {
                el.setAttribute(attributeName, translation.text);
            } else {
                if (!pendingTranslations.some(e => e.hash === hash)) {
                    pendingTranslations.push({ element: el, hash: hash });
                }
            }
        }

        if (!pendingTranslations.length)
            return;

        const textsToTranslate = pendingTranslations.map(item => ({
            hash: item.hash,
            text: item.element['original-' + attributeName]
        }));

        const newTranslations = await TovikEngine.bulkTranslate(textsToTranslate, this.#originalLang);
        if (newTranslations) {
            for (const item of pendingTranslations) {
                const translation = newTranslations.find(t => t.id === item.hash);
                if (translation) {
                    item.element.setAttribute(attributeName, translation.text);
                    db.translations.put(translation);
                }
            }
        }
    }

    async translateTextNodes(textNodes) {
        let pendingTranslations = [];

        await Promise.all(textNodes.map(async textNode => {
            if (!textNode.textContent)
                return;

            if (!textNode.originalText) {
                textNode.originalText = textNode.textContent.trim();
                textNode.preWhiteSpace = /^\s/.test(textNode.textContent);
                textNode.postWhiteSpace = /\s$/.test(textNode.textContent);
            }

            textNode.hash = TovikEngine.idHash(textNode.originalText);
            const translation = await db.translations.get(textNode.hash);
            if (translation) {
                textNode.textContent = ' ' + translation.text + ' ';
            } else {
                // Queue for bulk translation if not in cache
                if (!pendingTranslations.some(node => node.hash === textNode.hash)) {
                    pendingTranslations.push(textNode);
                }
            }
        }));

        if (pendingTranslations.length > 0) {
            await this.processBulkTranslations(pendingTranslations);
        }
    }

    async processBulkTranslations(pendingTranslations) {
        if (pendingTranslations.length === 0) return;

        const textsToTranslate = pendingTranslations.map(node => ({
            hash: node.hash,
            text: node.originalText
        }));

        const newTranslations = await TovikEngine.bulkTranslate(textsToTranslate, this.#originalLang);
        if (!newTranslations)
            return;

        for (const node of pendingTranslations) {
            const translation = newTranslations.find(t => t.id === node.hash);
            if (translation) {
                node.textContent =
                    (node.preWhiteSpace ? ' ' : '')
                    + translation.text
                    + (node.postWhiteSpace ? ' ' : '');
                node.translating = false;
                node.translated = true;
                db.translations.put(translation);
            }
        }
    }
}
