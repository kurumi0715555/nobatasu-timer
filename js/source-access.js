// 通常・授業・全画面から、その配布版自身の対応ソースへ移動する。
(() => {
    'use strict';
    const settings = window.TIMER_CONFIG || {};
    const value = typeof settings.sourceUrl === 'string' ? settings.sourceUrl.trim() : '';
    let sourceUrl = '';
    if (value) {
        try {
            const url = new URL(value, document.baseURI);
            const explicitHttp = /^https?:\/\//i.test(value);
            if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
                (explicitHttp || url.origin === location.origin)) {
                sourceUrl = url.href;
            }
        } catch (_) { /* 無効な設定ではリンクを表示しない。 */ }
    }
    const revision = typeof settings.revision === 'string' ? settings.revision.trim() : '';
    for (const link of document.querySelectorAll('[data-source-link]')) {
        link.hidden = !sourceUrl;
        if (!sourceUrl) {
            link.removeAttribute('href');
            continue;
        }
        link.href = sourceUrl;
        link.title = revision ? 'この版の対応ソース (' + revision + ')' : 'この版の対応ソース';
        link.target = '_blank';
        link.rel = 'noopener';
        link.setAttribute('aria-label', 'この版のソースコード（新しいタブで開く）');
    }
})();
