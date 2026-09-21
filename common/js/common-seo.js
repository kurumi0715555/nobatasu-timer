// 単独版の設定契約。外部URLは管理者が明示した設定に限る。
(function () {
    'use strict';
    const raw = window.TIMER_CONFIG || {};
    function text(value, fallback = '') {
        return typeof value === 'string' && value.trim() ? value.trim() : fallback;
    }
    function safeUrl(value, fallback = '') {
        if (typeof value !== 'string' || !value.trim()) return fallback;
        try {
            const url = new URL(value.trim(), document.baseURI);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return fallback;
            // //host/path は相対URLに見えて別ホストへ向かうため認めない。
            if (!/^https?:\/\//i.test(value.trim()) && url.origin !== location.origin) return fallback;
            return url.href;
        } catch (_) { return fallback; }
    }
    window.TimerSettings = Object.freeze({
        displayName: text(raw.displayName, '教室用タイマー'),
        operatorName: text(raw.operatorName),
        sourceUrl: safeUrl(raw.sourceUrl, new URL('./source/timer-source.zip', document.baseURI).href),
        revision: text(raw.revision, 'local-preview'),
        helpUrl: safeUrl(raw.helpUrl),
        privacyUrl: safeUrl(raw.privacyUrl),
        logoUrl: safeUrl(raw.logoUrl)
    });
    document.title = window.TimerSettings.displayName;
})();
