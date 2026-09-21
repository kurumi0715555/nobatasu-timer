(function () {
    'use strict';
    const settings = window.TimerSettings;
    const heading = document.querySelector('header h1');
    if (heading) heading.textContent = settings.displayName;
    if (settings.logoUrl) {
        const logo = document.createElement('img');
        logo.className = 'operator-logo';
        logo.alt = settings.operatorName || settings.displayName;
        logo.src = settings.logoUrl;
        logo.addEventListener('error', () => logo.remove());
        heading.before(logo);
    }
})();
