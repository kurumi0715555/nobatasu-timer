// npm test。HTTPサーバーを起動してBASE_URLを指定する（外部通信は禁止）。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8091/';
const origin = new URL(baseUrl).origin;
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseUrl).hostname), 'ローカルサーバーだけをテストする');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const failures = [];
async function scenario(name, run, init = null, config = null, options = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
    const errors = [];
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) { errors.push('外部通信: ' + url.href); await route.abort(); return; }
        if (config && url.pathname.endsWith('/config.js')) {
            await route.fulfill({ contentType: 'application/javascript', body: 'window.TIMER_CONFIG=' + JSON.stringify(config) + ';' });
        } else await route.continue();
    });
    if (init) await context.addInitScript(init);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ': ' + response.url()); });
    try {
        await page.goto(baseUrl);
        await page.waitForLoadState('networkidle');
        await run(page);
        assert.deepEqual(errors, []);
        console.log('PASS ' + name);
    } catch (error) { failures.push(name + ': ' + error.message); console.error('FAIL ' + name + ': ' + error.message); }
    finally { await context.close(); }
}
const status = page => page.locator('#timerStatus').textContent();
try {
    await scenario('初期表示・0秒・保存・リセット・整数入力', async page => {
        assert.equal(await page.title(), '教室用タイマー');
        assert.equal(await page.locator('#timerDisplay .minutes').textContent(), '05');
        await page.locator('.quick-btn[data-seconds="30"]').click();
        assert.equal(await page.locator('#timerDisplay .seconds').textContent(), '30');
        await page.reload();
        assert.equal(await page.locator('#secondsInput').inputValue(), '30');
        await page.locator('#secondsInput').fill('0');
        await page.locator('#startBtn').click();
        assert.equal(await status(page), '1秒以上の時間を設定してください');
        assert.equal(await page.locator('#timerDisplay .seconds').textContent(), '00');
        await page.locator('#minutesInput').fill('1.5');
        await page.locator('#startBtn').click();
        assert.match(await status(page), /整数/);
        await page.locator('#resetBtn').click();
        assert.equal(await page.locator('#minutesInput').inputValue(), '0');
        await page.locator('.quick-btn[data-minutes="1"]').click();
        await page.locator('#startBtn').click();
        assert.equal(await status(page), '実行中...');
        await page.locator('#pauseBtn').click();
        assert.equal(await status(page), '一時停止中');
        await page.locator('#resetBtn').click();
        assert.equal(await page.locator('#timerDisplay .minutes').textContent(), '01');
        assert.equal(await page.locator('#timerDisplay .seconds').textContent(), '00');
    });
    await scenario('1024×768横向き・44px操作・同梱アイコンフォント', async page => {
        const fonts = await page.evaluate(async () => {
            const loaded = await document.fonts.load('900 16px "Font Awesome 6 Free"', '\uf04b');
            await document.fonts.ready;
            const icon = getComputedStyle(document.querySelector('#startBtn i'), '::before');
            return {
                loaded: loaded.length > 0 && loaded.every(font => font.status === 'loaded'),
                available: document.fonts.check('900 16px "Font Awesome 6 Free"', '\uf04b'),
                family: icon.fontFamily,
                content: icon.content,
                overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            };
        });
        assert.equal(fonts.loaded, true);
        assert.equal(fonts.available, true);
        assert.match(fonts.family, /Font Awesome 6 Free/);
        assert.ok(fonts.content.includes('\uf04b'), '再生ボタンのsolid固有glyphを使用する');
        assert.equal(fonts.overflow, false);
        for (const button of await page.locator('button, [data-source-link]').all()) {
            if (!(await button.isVisible())) continue;
            const box = await button.boundingBox();
            assert.ok(box.width >= 44 && box.height >= 44, '主要操作の44pxを確保: ' + await button.textContent());
        }
        await page.locator('#fullscreenBtn').click();
        for (const selector of ['#fsStartBtn', '#fsResetBtn', '#exitFullscreen', '#fullscreenOverlay [data-source-link]']) {
            const box = await page.locator(selector).boundingBox();
            assert.ok(box.width >= 44 && box.height >= 44);
            assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1024 && box.y + box.height <= 768);
        }
    }, null, null, { viewport: { width: 1024, height: 768 } });
    await scenario('保存拒否でもタイマーと授業モードが動く', async page => {
        await page.locator('.quick-btn[data-minutes="1"]').click();
        await page.locator('#startBtn').click();
        assert.equal(await status(page), '実行中...');
        await page.locator('#classModeToggle').click();
        assert.equal(await page.locator('body').evaluate(node => node.classList.contains('class-mode-active')), true);
    }, () => {
        Storage.prototype.getItem = () => { throw new DOMException('blocked', 'SecurityError'); };
        Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); };
    });
    await scenario('不正保存値は5分へ戻す', async page => {
        assert.equal(await page.locator('#minutesInput').inputValue(), '5');
        assert.equal(await page.locator('#secondsInput').inputValue(), '0');
    }, () => { localStorage.setItem('timer_minutes', '-1'); localStorage.setItem('timer_seconds', 'NaN'); });
    await scenario('タブ復帰時刻・一時停止・終了後再開・音声resume', async page => {
        await page.locator('.quick-btn[data-seconds="30"]').click();
        await page.locator('#startBtn').click();
        await page.evaluate(() => { window.testOffset += 12000; document.dispatchEvent(new Event('visibilitychange')); });
        assert.equal(await page.locator('#timerDisplay .seconds').textContent(), '18');
        await page.locator('#pauseBtn').click();
        await page.evaluate(() => { window.testOffset += 60000; document.dispatchEvent(new Event('visibilitychange')); });
        assert.equal(await page.locator('#timerDisplay .seconds').textContent(), '18');
        await page.locator('#startBtn').click();
        await page.evaluate(() => { window.testOffset += 20000; document.dispatchEvent(new Event('visibilitychange')); });
        assert.equal(await status(page), '終了！');
        assert.equal(await page.locator('#timerDisplay .seconds').textContent(), '00');
        await page.locator('#startBtn').click();
        assert.equal(await status(page), '実行中...');
        assert.ok(await page.evaluate(() => window.testResumeCount > 0));
    }, () => {
        const now = Date.now.bind(Date);
        window.testOffset = 0;
        Date.now = () => now() + window.testOffset;
        window.testResumeCount = 0;
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (Audio) {
            window.AudioContext = class extends Audio {
                constructor() { super(); this.suspend(); }
            };
            const resume = Audio.prototype.resume;
            Audio.prototype.resume = function () { window.testResumeCount++; return resume.call(this); };
        }
    });
    await scenario('全画面Space二重操作防止・Escapeフォーカス・全モードソース導線', async page => {
        const checkSource = async selector => {
            const link = page.locator(selector);
            assert.equal(await link.isVisible(), true);
            const box = await link.boundingBox();
            assert.ok(box.height >= 44 && box.width >= 44);
            assert.ok((await link.getAttribute('href')).endsWith('/source/timer-source.zip'));
        };
        await checkSource('.source-access-normal');
        await page.locator('#classModeToggle').click();
        await checkSource('.source-access-normal');
        await page.locator('#fullscreenBtn').click();
        assert.equal(await page.locator('#exitFullscreen').evaluate(node => node === document.activeElement), true);
        await checkSource('#fullscreenOverlay [data-source-link]');
        await page.locator('#fsStartBtn').focus();
        await page.keyboard.press('Space');
        assert.equal(await status(page), '実行中...');
        await page.keyboard.press('Space');
        assert.equal(await status(page), '一時停止中');
        await page.locator('#exitFullscreen').focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('#fsStartBtn').evaluate(node => node === document.activeElement), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#fullscreenOverlay').isVisible(), false);
        assert.equal(await page.locator('#fullscreenBtn').evaluate(node => node === document.activeElement), true);
        await page.locator('#fullscreenBtn').evaluate(node => node.blur());
        await page.keyboard.press('Space');
        assert.equal(await status(page), '実行中...');
    });
    await scenario('fork設定・文字列の安全表示・任意リンク・原著と運営者分離', async page => {
        assert.equal(await page.title(), '<img src=x> 独自タイマー');
        assert.equal(await page.locator('header h1').textContent(), '<img src=x> 独自タイマー');
        assert.equal(await page.locator('header img').count(), 0);
        assert.match(await page.locator('footer').textContent(), /このサイトの運営: テスト運営/);
        assert.match(await page.locator('footer').textContent(), /原著: © 2025 NOBATASU/);
        assert.equal(await page.locator('.source-access-normal').getAttribute('href'), new URL('fork/source.zip', baseUrl).href);
        assert.equal(await page.locator('.instructions a').getAttribute('href'), new URL('help.html', baseUrl).href);
    }, null, { displayName: '<img src=x> 独自タイマー', operatorName: 'テスト運営', sourceUrl: './fork/source.zip', revision: 'fork-test', helpUrl: './help.html', privacyUrl: './privacy.html' });
    await scenario('危険URLは拒否・ソース導線を非表示', async page => {
        assert.equal(await page.locator('header img').count(), 0);
        assert.equal(await page.locator('.instructions a').count(), 0);
        assert.equal(await page.locator('footer a').count(), 0);
        assert.equal(await page.locator('[data-source-link][href]').count(), 0);
        assert.equal(await page.locator('[data-source-link]:visible').count(), 0);
    }, null, { sourceUrl: 'javascript:alert(1)', helpUrl: 'data:text/html,bad', logoUrl: '//outside.invalid/logo.png', privacyUrl: 'file:///etc/passwd' });
} finally { await browser.close(); }
if (failures.length) throw new Error(failures.join('\n'));
console.log('All 8 browser scenarios passed.');
