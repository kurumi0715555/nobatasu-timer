// 表示間隔ではなく終了時刻から残り時間を計算する教室用タイマー。
(() => {
    'use strict';
    const byId = id => document.getElementById(id);
    const display = byId('timerDisplay');
    const fullscreenDisplay = byId('fullscreenDisplay');
    const displayArea = document.querySelector('.timer-display-area');
    const overlay = byId('fullscreenOverlay');
    const minutesInput = byId('minutesInput');
    const secondsInput = byId('secondsInput');
    const startButtons = [byId('startBtn'), byId('fsStartBtn')];
    const pauseButtons = [byId('pauseBtn'), byId('fsPauseBtn')];
    let totalSeconds = 300;
    let remainingMs = 300000;
    let deadline = 0;
    let interval = null;
    let running = false;
    let finished = false;
    let lastSecond = 300;
    let audioContext = null;
    let alarmTimeouts = [];
    let previousFocus = null;

    function validTime(minutes, seconds) {
        return Number.isInteger(minutes) && minutes >= 0 && minutes <= 99 &&
            Number.isInteger(seconds) && seconds >= 0 && seconds <= 59;
    }
    function readInputs() {
        const minutes = minutesInput.value === '' ? 0 : Number(minutesInput.value);
        const seconds = secondsInput.value === '' ? 0 : Number(secondsInput.value);
        return validTime(minutes, seconds) ? [minutes, seconds] : null;
    }
    function status(text) {
        byId('timerStatus').textContent = text;
        byId('fullscreenStatus').textContent = text;
    }
    function render() {
        const seconds = Math.ceil(remainingMs / 1000);
        const minuteText = String(Math.floor(seconds / 60)).padStart(2, '0');
        const secondText = String(seconds % 60).padStart(2, '0');
        display.querySelector('.minutes').textContent = minuteText;
        display.querySelector('.seconds').textContent = secondText;
        fullscreenDisplay.querySelector('.fs-minutes').textContent = minuteText;
        fullscreenDisplay.querySelector('.fs-seconds').textContent = secondText;
        for (const node of [display, fullscreenDisplay]) {
            node.classList.toggle('running', running);
            node.classList.toggle('finished', finished);
        }
        displayArea.classList.toggle('finished', finished);
        overlay.classList.toggle('finished', finished);
        const focused = document.activeElement;
        startButtons.forEach((button, index) => {
            button.style.display = running ? 'none' : 'inline-flex';
            button.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i> ' +
                (!finished && remainingMs < totalSeconds * 1000 ? '再開' : 'スタート');
            pauseButtons[index].style.display = running ? 'inline-flex' : 'none';
            if (running && focused === button) pauseButtons[index].focus();
            if (!running && focused === pauseButtons[index]) button.focus();
        });
        minutesInput.disabled = running;
        secondsInput.disabled = running;
    }
    async function unlockAudio() {
        try {
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) return;
            if (!audioContext) audioContext = new Audio();
            if (audioContext.state === 'suspended') await audioContext.resume();
        } catch (_) { /* 音声が使えなくても画面で終了を伝える。 */ }
    }
    function beep(frequency = 800, duration = 0.1) {
        if (!audioContext || audioContext.state !== 'running') return;
        try {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.2, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
            oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
            oscillator.start();
            oscillator.stop(audioContext.currentTime + duration);
        } catch (_) { /* 通知音のエラーはタイマーを中断しない。 */ }
    }
    function stopAlarm() {
        alarmTimeouts.forEach(clearTimeout);
        alarmTimeouts = [];
    }
    function finish() {
        clearInterval(interval);
        running = false;
        finished = true;
        remainingMs = 0;
        render();
        status('終了！');
        stopAlarm();
        for (let index = 0; index < 10; index++) {
            alarmTimeouts.push(setTimeout(() => { beep(800, 0.4); beep(1000, 0.4); }, index * 500));
        }
    }
    function tick() {
        if (!running) return;
        remainingMs = Math.max(0, deadline - Date.now());
        const seconds = Math.ceil(remainingMs / 1000);
        if (seconds === 0) { finish(); return; }
        if (seconds !== lastSecond && seconds <= 10) beep(600);
        lastSecond = seconds;
        render();
    }
    function start() {
        if (running) return;
        const input = readInputs();
        if (!input) { status('分は0〜99、秒は0〜59の整数で入力してください'); return; }
        if (input[0] * 60 + input[1] === 0) { status('1秒以上の時間を設定してください'); return; }
        if (finished) reset();
        stopAlarm();
        running = true;
        deadline = Date.now() + remainingMs;
        lastSecond = Math.ceil(remainingMs / 1000);
        interval = setInterval(tick, 100);
        render();
        status('実行中...');
        unlockAudio().then(() => { if (running) beep(1000); });
    }
    function pause() {
        if (!running) return;
        tick();
        if (!running) return;
        running = false;
        clearInterval(interval);
        render();
        status('一時停止中');
        beep(600);
    }
    function reset() {
        clearInterval(interval);
        stopAlarm();
        running = false;
        finished = false;
        remainingMs = totalSeconds * 1000;
        // 不正入力で表示と設定が食い違った場合も設定時刻へ揃える。
        minutesInput.value = Math.floor(totalSeconds / 60);
        secondsInput.value = totalSeconds % 60;
        render();
        status('準備完了');
    }
    function setTime(minutes, seconds) {
        totalSeconds = minutes * 60 + seconds;
        try {
            localStorage.setItem('timer_minutes', String(minutes));
            localStorage.setItem('timer_seconds', String(seconds));
        } catch (_) { /* 保存拒否時はこのページ内だけで利用する。 */ }
        reset();
    }
    for (const input of [minutesInput, secondsInput]) {
        input.addEventListener('input', () => {
            if (running) return;
            const time = readInputs();
            if (!time) { status('分は0〜99、秒は0〜59の整数で入力してください'); return; }
            // 空欄入力の途中でもフォーカス中の入力文字列は保持する。
            const values = [minutesInput.value, secondsInput.value];
            setTime(...time);
            [minutesInput.value, secondsInput.value] = values;
        });
    }
    document.querySelectorAll('.quick-btn').forEach(button => {
        button.addEventListener('click', () => setTime(Number(button.dataset.minutes || 0), Number(button.dataset.seconds || 0)));
    });
    startButtons.forEach(button => button.addEventListener('click', start));
    pauseButtons.forEach(button => button.addEventListener('click', pause));
    [byId('resetBtn'), byId('fsResetBtn')].forEach(button => button.addEventListener('click', reset));

    function closeFullscreen() {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        document.body.classList.remove('fullscreen-mode');
        document.querySelector('.site-wrapper').inert = false;
        byId('classModeToggle').inert = false;
        if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    }
    byId('fullscreenBtn').addEventListener('click', () => {
        previousFocus = document.activeElement;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        document.body.classList.add('fullscreen-mode');
        document.querySelector('.site-wrapper').inert = true;
        byId('classModeToggle').inert = true;
        byId('exitFullscreen').focus();
    });
    byId('exitFullscreen').addEventListener('click', closeFullscreen);
    document.addEventListener('keydown', event => {
        if (event.code === 'Escape' && overlay.classList.contains('active')) {
            event.preventDefault();
            closeFullscreen();
        }
        if (event.code === 'Tab' && overlay.classList.contains('active')) {
            const nodes = [...overlay.querySelectorAll('button, a[href]')].filter(node => node.getClientRects().length);
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
        // ボタンとリンクはブラウザ本来のSpace操作に任せ、二重操作しない。
        if (event.code !== 'Space' || event.repeat || event.target.closest('input, textarea, select, button, a, [contenteditable]')) return;
        event.preventDefault();
        running ? pause() : start();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    window.addEventListener('pageshow', tick);
    try {
        const minutes = localStorage.getItem('timer_minutes');
        const seconds = localStorage.getItem('timer_seconds');
        if (minutes !== null && seconds !== null && minutes.trim() && seconds.trim() && validTime(Number(minutes), Number(seconds))) {
            totalSeconds = Number(minutes) * 60 + Number(seconds);
        }
    } catch (_) { /* ブラウザ保存が利用できなければ既定値を使う。 */ }
    reset();
})();
