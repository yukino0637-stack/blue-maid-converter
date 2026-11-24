const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-skin-ui-'));
  const errors = [];
  let electron;
  let page;

  async function launch() {
    electron = await _electron.launch({
      executablePath: require('electron'),
      args: ['.', '--user-data-dir=' + path.join(directory, 'profile')],
      cwd: process.cwd(),
      env: { ...process.env },
      timeout: 60_000,
    });
    page = await electron.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => typeof soundReady !== 'undefined');
    await page.evaluate(() => soundReady);
    await page.waitForFunction(() => state !== 'checking', undefined, { timeout: 150_000 });
    await page.waitForFunction(() => animation === 'idle' && !videos.idle.paused && videos.idle.readyState >= 2);
  }

  async function openMenu() {
    await page.locator('#pet').hover({ position: { x: 59, y: 67 } });
    await page.locator('#menu-toggle').hover();
    const card = await page.locator('#pet-menu').boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  }

  try {
    await launch();
    const geometry = await page.evaluate(() => {
      const box = element => { const r = element.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(value => Math.round(value)); };
      return { hit: box(petArea), video: box(videos.idle) };
    });
    assert.deepEqual(geometry.hit, [171, 229, 118, 134]);
    assert.deepEqual(geometry.video, [102, 228, 256, 144]);
    assert.equal(await page.evaluate(() => skin), 'maid');
    assert.equal(await page.evaluate(() => localStorage.getItem('pet-skin')), null);
    assert.equal(await page.evaluate(() => decodeURI(videos.idle.src).endsWith('/待机呼吸休闲.webm')), true);
    await openMenu();
    assert.equal(await page.locator('#skin-maid').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#activity-toggle').isDisabled(), false);
    await page.mouse.move(350, 10);
    await page.waitForFunction(() => petMenu.hidden);

    const box = await page.locator('#pet').boundingBox();
    await page.mouse.move(box.x + 59, box.y + 67);
    await page.mouse.down();
    await page.mouse.move(box.x + 71, box.y + 67);
    await page.waitForFunction(() => animation === 'drag' && videos.drag.loop && decodeURI(videos.drag.src).includes('被鼠标拖拽悬空反馈'));
    await page.mouse.up();
    assert.ok(await page.evaluate(() => !videos.drag.loop && videos.drag.currentTime >= 8.5 && videos.drag.currentTime < 9));
    await page.waitForFunction(() => animation === 'idle' && !videos.idle.paused, undefined, { timeout: 3_000 });

    await openMenu();
    await page.locator('#skin-claude').click();
    await page.waitForFunction(() => skin === 'claude' && animation === 'idle' && !videos.idle.paused && videos.idle.readyState >= 2 && decodeURI(videos.idle.src).endsWith('/idle.webm'));
    assert.equal(await page.evaluate(() => localStorage.getItem('pet-skin')), 'claude');
    const sources = await page.evaluate(() => Object.fromEntries(Object.entries(videos).map(([name, video]) => [name, decodeURI(video.src).split('/').at(-1)])));
    assert.deepEqual(sources, {
      idle: 'idle.webm', working: 'working.webm', finish: 'finish.webm', interaction: 'interaction.webm', drag: 'drag.webm',
    });
    assert.equal(await page.locator('#activity-toggle').isDisabled(), true);
    assert.equal(await page.locator('#skin-claude').getAttribute('aria-pressed'), 'true');
    const claudeGeometry = await page.evaluate(() => {
      const box = element => { const r = element.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(value => Math.round(value)); };
      return { hit: box(petArea), video: box(videos.idle), fit: getComputedStyle(videos.idle).objectFit };
    });
    assert.deepEqual(claudeGeometry.hit, [171, 229, 118, 134]);
    assert.deepEqual(claudeGeometry.video, [102, 228, 256, 144]);
    assert.equal(claudeGeometry.fit, 'contain');
    const pixels = await page.evaluate(() => {
      const video = videos.idle;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(video, 0, 0);
      const corner = context.getImageData(1, 1, 1, 1).data;
      const badge = context.getImageData(250, 170, 130, 90).data;
      let dark = 0;
      let orange = 0;
      for (let i = 0; i < badge.length; i += 4) {
        const [r, g, b, a] = [badge[i], badge[i + 1], badge[i + 2], badge[i + 3]];
        if (a > 180 && r < 90 && g < 90 && b < 110) dark++;
        if (a > 180 && r > 180 && g > 70 && g < 190 && b < 100) orange++;
      }
      return { width: video.videoWidth, height: video.videoHeight, corner: [...corner], dark, orange };
    });
    assert.deepEqual([pixels.width, pixels.height], [640, 360]);
    assert.equal(pixels.corner[3], 0, '透明边缘不挡住桌面');
    assert.ok(pixels.dark > 8, '工牌文字像素还在');
    assert.ok(pixels.orange > 8, '工牌上的橙色标记还在');

    await page.mouse.move(350, 10);
    await page.locator('#pet').click({ position: { x: 59, y: 67 } });
    await page.waitForFunction(() => animation === 'interaction' && !videos.interaction.paused && !videos.interaction.loop && decodeURI(videos.interaction.src).endsWith('/interaction.webm'));
    assert.equal(await page.evaluate(() => reducedMotion || bounce.effect.getKeyframes().some(frame => frame.transform === 'scale(1.06, 0.88)')), true);
    await page.evaluate(() => { videos.interaction.currentTime = videos.interaction.duration - .08; });
    await page.waitForFunction(() => animation === 'idle' && decodeURI(videos.idle.src).endsWith('/idle.webm'));

    await page.locator('#pet').click({ button: 'right', position: { x: 59, y: 67 } });
    assert.equal(await page.evaluate(() => animation), 'idle');
    assert.equal(await page.evaluate(() => decodeURI(videos.idle.src).endsWith('/idle.webm')), true);

    const claudeBox = await page.locator('#pet').boundingBox();
    await page.mouse.move(claudeBox.x + 59, claudeBox.y + 67);
    await page.mouse.down();
    await page.mouse.move(claudeBox.x + 74, claudeBox.y + 67);
    await page.waitForFunction(() => animation === 'drag' && videos.drag.loop && decodeURI(videos.drag.src).endsWith('/drag.webm'));
    await page.mouse.up();
    assert.ok(await page.evaluate(() => !videos.drag.loop && videos.drag.currentTime >= 4 && videos.drag.currentTime < 4.5 && videos.drag.currentTime < 8.5));
    await page.waitForFunction(() => animation === 'idle', undefined, { timeout: 3_000 });

    await page.evaluate(() => { setState('converting'); playAnimation('working'); });
    await page.waitForFunction(() => state === 'converting' && animation === 'working' && decodeURI(videos.working.src).endsWith('/working.webm'));
    await page.locator('#pet').click({ force: true, position: { x: 59, y: 67 } });
    const during = await page.evaluate(() => {
      const before = animation;
      const moved = pet.getBoundingClientRect();
      return { animation: before, src: decodeURI(videos.working.src).split('/').at(-1), left: moved.x };
    });
    assert.equal(during.animation, 'working');
    assert.equal(during.src, 'working.webm');
    await page.mouse.move(claudeBox.x + 59, claudeBox.y + 67);
    await page.mouse.down();
    await page.mouse.move(claudeBox.x + 80, claudeBox.y + 67);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => animation), 'working');
    await openMenu();
    assert.equal(await page.locator('#skin-claude').isDisabled(), true);
    assert.equal(await page.locator('#activity-toggle').isDisabled(), true);
    await page.evaluate(() => setState('success'));
    await page.waitForFunction(() => animation === 'finish' && !videos.finish.loop && decodeURI(videos.finish.src).endsWith('/finish.webm'));
    await page.evaluate(() => { videos.finish.currentTime = videos.finish.duration - .08; });
    await page.waitForFunction(() => animation === 'idle' && state === 'success');

    await electron.close();
    electron = undefined;
    await launch();
    assert.equal(await page.evaluate(() => skin), 'claude');
    assert.equal(await page.evaluate(() => localStorage.getItem('pet-skin')), 'claude');
    assert.equal(await page.evaluate(() => decodeURI(videos.idle.src).endsWith('/idle.webm')), true);
    await openMenu();
    await page.locator('#skin-maid').click();
    await page.waitForFunction(() => skin === 'maid' && animation === 'idle' && decodeURI(videos.idle.src).includes('待机呼吸休闲'));
    assert.equal(await page.locator('#activity-toggle').isDisabled(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('pet-skin')), 'maid');
    assert.deepEqual(errors, []);
    console.log('PASS Claude 皮肤切换、透明画面、工牌像素、点击与拖拽落地、转换中不抢动画，以及重启记忆和回到女仆。');
  } finally {
    if (electron) await electron.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
