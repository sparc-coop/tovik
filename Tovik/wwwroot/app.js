function copyToClipboard(html) {
    var code = html.originalCode ?? html.innerHTML;
    console.log('copying', code);
    
    var text = code.toString().replace(/<!--!-->/g, '') // get rid of blazor debug comments

    navigator.clipboard.writeText(text);
}

function highlight(codeBlock) {
    if (!codeBlock.originalCode) {

        // decode HTML entities
        var txt = document.createElement('textarea');
        txt.innerHTML = codeBlock.innerHTML;
        codeBlock.originalCode = txt.value;
    }

    hljs.highlightElement(codeBlock);
    console.log('highlighted', codeBlock.originalCode);
}

function populatePreviewCode(previewBlock, codeBlock) {
    if (!previewBlock?.innerHTML)
        return;

    var htmlWithBetterLineBreaks = previewBlock.innerHTML.replace(/>([^\r\n])/g, function (match, $1) { return '>\r\n' + $1 })
        .replace(/([^\s])</g, function (match, $1) { return $1 + '\r\n<' })
        .replace(/\r\n\s*\r\n/g, '\r\n');

    var encodedHtml = html_beautify(htmlWithBetterLineBreaks, { indent_size: 2 })
        .replace(/<!--!-->/g, '') // get rid of blazor debug comments
        .replace(/[\u00A0-\u9999<>\&]/g, function (i) { // switch to html entities
            return '&#' + i.charCodeAt(0) + ';';
        });

    codeBlock.innerHTML = encodedHtml;
    hljs.highlightElement(codeBlock);
}

function hideAllDomainActions() {
    var menus = document.querySelectorAll('.actions-menu');
    menus.forEach(menu => {
        menu.classList.remove('show');
    });
}

function goBack() {
    window.history.back();
}

function disableBodyScrolling(bool) {
    if (bool == true) {
        document.body.classList.add("modal-open");
    } else {
        document.body.classList.remove("modal-open");
    }
}