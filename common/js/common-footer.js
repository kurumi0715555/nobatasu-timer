(function () {
    'use strict';
    const settings = window.TimerSettings;
    const footer = document.querySelector('footer');
    function line(text) {
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        footer.append(paragraph);
    }
    if (settings.operatorName) line('このサイトの運営: ' + settings.operatorName);
    line('原著: © 2025 NOBATASU');
    line('NOBATASU Toolsを基にした独立版');
    line('配布版: ' + settings.revision);
    if (settings.privacyUrl) {
        const link = document.createElement('a');
        link.className = 'standalone-link';
        link.href = settings.privacyUrl;
        link.textContent = 'プライバシーについて';
        footer.append(link);
    }
    for (const link of document.querySelectorAll('[data-source-link]')) {
        link.href = settings.sourceUrl;
        link.title = 'この版の対応ソース (' + settings.revision + ')';
        link.target = '_blank';
        link.rel = 'noopener';
        link.setAttribute('aria-label', 'この版のソースコード（新しいタブで開く）');
    }
})();
