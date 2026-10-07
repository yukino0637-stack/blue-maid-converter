const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const actions = require('../src/actions.js');

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-actions-ui-'));
  const entries = Object.entries(actions);
  const errors = [];
  let electron;
  try {
    const sources = JSON.parse(await fs.readFile(path.resolve('assets/dsh-pet/ADDITIONAL-SOURCES.json'), 'utf8'));
    assert.equal(sources.files.length, 100);
    for (const file of sources.files) {
      const bytes = await fs.readFile(path.resolve('assets/dsh-pet', file.file));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    }
    assert.equal(entries.length, 105);
    assert.equal(new Set(entries.map(([, action]) => action.video)).size, 105);
    for (const [, action] of entries) {
      assert.ok(!action.video.includes('/') && !action.video.includes('..'));
      await fs.access(path.resolve('assets/dsh-pet', action.video + '.webm'));
    }
    electron = await _electron.launch({ executablePath: require('electron'), args: ['.', '--user-data-dir=' + path.join(directory, 'profile')], cwd: process.cwd(), env: { ...process.env }, timeout: 60_000 });
    const page = await electron.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => typeof soundReady !== 'undefined');
    await page.evaluate(() => soundReady);
    await page.waitForFunction(() => state !== 'checking', undefined, { timeout: 150_000 });
    assert.equal(await page.locator('#activity-list button').count(), 106);
    assert.equal(await page.locator('#activity-list h2').count(), 13);
    assert.equal(await page.evaluate(() => typeof require), 'undefined', '保留 renderer 沙箱');
    let played = 0;
    for (const [id, action] of entries) {
      await page.locator('#pet').hover({ position: { x: 59, y: 67 } });
      await page.locator('#menu-toggle').hover();
      const card = await page.locator('#pet-menu').boundingBox();
      await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
      await page.locator('#activity-toggle').click();
      await page.locator(`[data-action="${id}"]`).click();
      await page.waitForFunction(expected => animation === 'interaction' && !videos.interaction.paused && videos.interaction.currentTime > .1 && decodeURI(videos.interaction.src).endsWith('/' + expected + '.webm'), action.video);
      const decoded = await page.evaluate(() => {
        const video = videos.interaction;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const context = canvas.getContext('2d'); context.drawImage(video, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let transparent = 0, visible = 0;
        for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] === 0) transparent++; if (pixels[i] > 128) visible++; }
        return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, loop: video.loop,
          fit: getComputedStyle(video).objectFit, transparent, visible, menuHidden: petMenu.hidden };
      });
      assert.ok(decoded.width > 0 && decoded.height > 0 && decoded.duration > 0);
      assert.equal(decoded.loop, false); assert.equal(decoded.fit, 'contain'); assert.equal(decoded.menuHidden, true);
      assert.ok(decoded.transparent > 0 && decoded.visible > 0, action.video + ' 实际帧包含透明背景和人物');
      // 用真实视频时钟跳到结尾，等待真实 ended；不人工派发结束事件。
      await page.evaluate(() => { videos.interaction.currentTime = Math.max(0, videos.interaction.duration - .15); });
      await page.waitForFunction(() => animation === 'idle' && !videos.idle.paused && videos.idle.loop);
      console.log(`PASS ${++played}/${entries.length} ${action.category}：${action.label}，透明解码/单次播放/ended 回待机`);
    }
    await electron.evaluate(({ Menu }) => {
      globalThis.actionMenuProbe = { selected: undefined };
      Menu.prototype.popup = function(options) {
        const flatten = menu => menu.items.flatMap(item => item.submenu ? flatten(item.submenu) : item.type === 'separator' ? [] : [{ id: item.id, label: item.label }]);
        actionMenuProbe.items = flatten(this);
        actionMenuProbe.categories = this.items.filter(item => item.submenu).map(item => item.label);
        if (actionMenuProbe.selected) this.getMenuItemById(actionMenuProbe.selected)?.click();
        options.callback();
      };
    });
    await page.locator('#pet').click({ button: 'right', position: { x: 59, y: 67 } });
    const native = await electron.evaluate(() => actionMenuProbe);
    assert.deepEqual(native.items, [...entries.map(([id, action]) => ({ id, label: action.label })), { id: 'idle', label: '回到待机' }]);
    assert.equal(native.categories.length, 13);
    const [lastId, lastAction] = entries.at(-1);
    await electron.evaluate((_, id) => { actionMenuProbe.selected = id; }, lastId);
    await page.locator('#pet').click({ button: 'right', position: { x: 59, y: 67 } });
    await page.waitForFunction(name => animation === 'interaction' && !videos.interaction.paused && videos.interaction.currentTime > 0 && decodeURI(videos.interaction.src).includes(name), lastAction.video);
    await electron.evaluate(() => { actionMenuProbe.selected = 'idle'; });
    await page.locator('#pet').click({ button: 'right', position: { x: 59, y: 67 } });
    assert.equal(await page.evaluate(() => animation), 'idle');
    // 原有忙碌保护：所有活动在接收、检查、转换、成功结束动画期间均不能抢占。
    for (const busyState of ['receiving', 'checking', 'converting', 'success']) {
      await page.evaluate(next => setState(next), busyState);
      const blocked = await page.evaluate(id => {
        const before = animation; interact(id);
        return { unchanged: animation === before, enabled: [...document.querySelectorAll('#activity-list button')].filter(button => !button.disabled).length };
      }, lastId);
      assert.equal(blocked.unchanged, true); assert.equal(blocked.enabled, 0);
    }
    await page.evaluate(() => setState('idle'));
    assert.deepEqual(errors, []);
    console.log('PASS 全部 106 个活动入口、13 个分类、100 份新增素材校验、105 个动画实际透明播放与真实 ended 回待机；原生菜单清单一致、活动忙碌保护。原生菜单选项点击由测试替代。');
  } finally {
    if (electron) await electron.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
