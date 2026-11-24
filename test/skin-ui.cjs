const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const claudeSkinClips = require('../src/claude-skin.js');
const claudeClickKeys = ['wave', 'hop', 'shy', 'pout', 'look'];

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

  async function playToIdle(key) {
    await openMenu();
    await page.locator('#activity-toggle').click();
    await page.locator(`#claude-activity-list [data-claude="${key}"]`).click();
    if (key === 'idle') {
      await page.waitForFunction(() => animation === 'idle' && !videos.idle.paused && decodeURI(videos.idle.src).endsWith('/idle.webm'));
      return;
    }
    await page.waitForFunction(expected => animation === 'interaction' && !videos.interaction.paused && !videos.interaction.loop && Number.isFinite(videos.interaction.duration) && decodeURI(videos.interaction.src).endsWith('/' + expected + '.webm'), key);
    await page.evaluate(() => { videos.interaction.currentTime = Math.max(0, videos.interaction.duration - .08); });
    await page.waitForFunction(() => animation === 'idle' && !videos.idle.paused && decodeURI(videos.idle.src).endsWith('/idle.webm'));
  }

  try {
    await launch();
    const geometry = await page.evaluate(() => {
      const box = element => { const rect = element.getBoundingClientRect(); return [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value)); };
      const scene = document.getElementById('scene').getBoundingClientRect();
      return { hit: box(petArea), video: box(videos.idle), scene: [scene.width, scene.height].map(value => Math.round(value)) };
    });
    assert.deepEqual(geometry.scene, [360, 400]);
    assert.deepEqual(geometry.hit, [171, 229, 118, 134]);
    assert.deepEqual(geometry.video, [102, 228, 256, 144]);
    assert.equal(await page.evaluate(() => skin), 'maid');
    assert.equal(await page.evaluate(() => localStorage.getItem('pet-skin')), null);
    assert.equal(await page.evaluate(() => decodeURI(videos.idle.src).endsWith('/待机呼吸休闲.webm')), true);
    assert.equal(await page.locator('#activity-list button').count(), 106);
    await openMenu();
    assert.equal(await page.locator('#activity-toggle').isDisabled(), false);
    await page.mouse.move(350, 10);
    await page.waitForFunction(() => petMenu.hidden);

    const maidBox = await page.locator('#pet').boundingBox();
    await page.mouse.move(maidBox.x + 59, maidBox.y + 67);
    await page.mouse.down();
    await page.mouse.move(maidBox.x + 74, maidBox.y + 67);
    await page.waitForFunction(() => animation === 'drag' && videos.drag.loop && decodeURI(videos.drag.src).includes('被鼠标拖拽悬空反馈'));
    await page.mouse.up();
    assert.ok(await page.evaluate(() => !videos.drag.loop && videos.drag.currentTime >= 8.5 && videos.drag.currentTime < 9));
    await page.evaluate(() => { videos.drag.currentTime = videos.drag.duration - .08; });
    await page.waitForFunction(() => animation === 'idle');

    await page.evaluate(() => { setState('converting'); playAnimation('working'); });
    await page.evaluate(() => selectSkin('claude'));
    assert.equal(await page.evaluate(() => skin), 'maid');
    assert.equal(await page.evaluate(() => state), 'converting');
    assert.equal(await page.evaluate(() => animation), 'working');
    await page.locator('#pet').click({ force: true, position: { x: 59, y: 67 } });
    assert.equal(await page.evaluate(() => animation), 'working');
    const box = await page.locator('#pet').boundingBox();
    await page.mouse.move(box.x + 59, box.y + 67);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 67);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => animation), 'working');
    assert.equal(await page.evaluate(() => decodeURI(videos.working.src).includes('忙碌点按')), true);
    await page.evaluate(() => setState('idle'));
    await page.waitForFunction(() => animation === 'idle');

    await openMenu();
    await page.locator('#skin-claude').click();
    await page.waitForFunction(() => skin === 'claude' && animation === 'idle' && !videos.idle.paused && decodeURI(videos.idle.src).endsWith('/idle.webm'));
    assert.equal(await page.evaluate(() => localStorage.getItem('pet-skin')), 'claude');
    const sameGeometry = await page.evaluate(() => {
      const box = element => { const rect = element.getBoundingClientRect(); return [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value)); };
      const video = videos.idle;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(video, 0, 0);
      return { hit: box(petArea), video: box(video), corner: context.getImageData(1, 1, 1, 1).data[3] };
    });
    assert.deepEqual(sameGeometry.hit, [171, 229, 118, 134]);
    assert.deepEqual(sameGeometry.video, [102, 228, 256, 144]);
    assert.equal(sameGeometry.corner, 0);
    await page.screenshot({ path: '/opt/cursor/artifacts/claude-skin-idle.png', omitBackground: true });
    await openMenu();
    await page.locator('#activity-toggle').click();
    assert.equal(await page.locator('#claude-activity-list button').count(), 25);
    assert.equal(await page.locator('#activity-list').isHidden(), true);
    const labels = await page.locator('#claude-activity-list button').allTextContents();
    assert.deepEqual(labels, claudeSkinClips.map(clip => clip.label));
    assert.equal(labels.includes('抬腿踢出'), true);
    assert.equal(labels.includes('踢毽子'), false);
    await page.locator('#claude-activity-list [data-claude="wave"]').click();
    await page.waitForFunction(() => animation === 'interaction' && Number.isFinite(videos.interaction.duration) && decodeURI(videos.interaction.src).endsWith('/wave.webm'));
    await page.screenshot({ path: '/opt/cursor/artifacts/claude-skin-wave.png', omitBackground: true });
    await page.evaluate(() => { videos.interaction.currentTime = videos.interaction.duration - .08; });
    await page.waitForFunction(() => animation === 'idle');

    for (const clip of claudeSkinClips) {
      if (clip.key === 'wave') continue;
      await playToIdle(clip.key);
    }
    await page.evaluate(() => {
      window.played = [];
      const original = interact;
      interact = action => { window.played.push(action); return original(action); };
    });
    for (let index = 0; index < claudeClickKeys.length; index++) {
      await page.evaluate(value => { window.originalRandom = Math.random; Math.random = () => value; }, (index + .5) / claudeClickKeys.length);
      await page.locator('#pet').click({ force: true, position: { x: 59, y: 67 } });
      await page.evaluate(() => { Math.random = window.originalRandom; });
      await page.waitForFunction(expected => animation === 'interaction' && !videos.interaction.paused && Number.isFinite(videos.interaction.duration) && decodeURI(videos.interaction.src).endsWith('/' + expected + '.webm'), claudeClickKeys[index]);
      await page.evaluate(() => { videos.interaction.currentTime = videos.interaction.duration - .08; });
      await page.waitForFunction(() => animation === 'idle');
    }
    assert.deepEqual(await page.evaluate(() => window.played), claudeClickKeys);

    const claudeBox = await page.locator('#pet').boundingBox();
    await page.mouse.move(claudeBox.x + 59, claudeBox.y + 67);
    await page.mouse.down();
    await page.mouse.move(claudeBox.x + 78, claudeBox.y + 67);
    await page.waitForFunction(() => animation === 'drag' && videos.drag.loop && decodeURI(videos.drag.src).endsWith('/drag.webm'));
    await page.evaluate(() => { videos.drag.currentTime = 8.2; });
    await page.waitForFunction(() => videos.drag.loop && videos.drag.currentTime < 8);
    await page.mouse.up();
    assert.ok(await page.evaluate(() => !videos.drag.loop && videos.drag.currentTime >= 8 && videos.drag.currentTime < 8.5));
    await page.evaluate(() => { videos.drag.currentTime = videos.drag.duration - .08; });
    await page.waitForFunction(() => animation === 'idle', undefined, { timeout: 3_000 });

    await page.evaluate(() => setState('error'));
    await page.waitForFunction(() => animation === 'interaction' && Number.isFinite(videos.interaction.duration) && decodeURI(videos.interaction.src).endsWith('/fail.webm'));
    await page.evaluate(() => { videos.interaction.currentTime = videos.interaction.duration - .08; });
    await page.waitForFunction(() => animation === 'idle');

    await page.evaluate(() => { setState('converting'); playAnimation('working'); });
    assert.equal(await page.evaluate(() => decodeURI(videos.working.src).endsWith('/working.webm') && videos.working.loop), true);
    await page.locator('#pet').click({ force: true, position: { x: 59, y: 67 } });
    assert.equal(await page.evaluate(() => animation), 'working');
    await page.mouse.move(claudeBox.x + 59, claudeBox.y + 67);
    await page.mouse.down();
    await page.mouse.move(claudeBox.x + 90, claudeBox.y + 67);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => state === 'converting' && animation === 'working'), true);
    await page.evaluate(() => selectSkin('maid'));
    assert.equal(await page.evaluate(() => skin === 'claude' && state === 'converting'), true);
    await page.evaluate(() => setState('idle'));
    await page.waitForFunction(() => animation === 'idle');

    await page.evaluate(() => { selectSkin('maid'); selectSkin('claude'); });
    await page.waitForFunction(() => skin === 'claude' && animation === 'idle' && decodeURI(videos.idle.src).endsWith('/claude-skin/idle.webm'));
    await electron.close();
    electron = undefined;
    await launch();
    assert.equal(await page.evaluate(() => skin), 'claude');
    assert.equal(await page.evaluate(() => localStorage.getItem('pet-skin')), 'claude');
    await openMenu();
    await page.locator('#skin-maid').click();
    await page.waitForFunction(() => skin === 'maid' && animation === 'idle' && decodeURI(videos.idle.src).includes('待机呼吸休闲'));
    assert.equal(await page.locator('#activity-toggle').isDisabled(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('pet-skin')), 'maid');
    assert.deepEqual(errors, []);
    console.log('PASS Claude 25 段可播并回待机，拖拽前 8 秒循环、松手从 8 秒落地，转换中不抢工作态，女仆 8.5 秒和选择记忆仍在。');
  } finally {
    if (electron) await electron.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
