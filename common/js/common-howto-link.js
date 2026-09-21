(function () {
    'use strict';
    const url = window.TimerSettings.helpUrl;
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.textContent = '詳しい使い方';
    link.className = 'standalone-link';
    document.querySelector('.instructions').append(link);
})();
