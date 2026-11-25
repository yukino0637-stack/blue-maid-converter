const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const actions = require('../src/actions.js');
const claudeSkinClips = require('../src/claude-skin.js');

const maidLabels = [...Object.values(actions).map(action => action.label), '回到待机'];
const claudeLabels = claudeSkinClips.map(clip => clip.label);

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-skin-menu-'));
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
    await page.waitForFunction(() => !petMenu.hidden);
  }

  async function openActivities() {
    if (await page.evaluate(() => petMenu.hidden || !$('activity-card').hidden)) {
      if (await page.evaluate(() => petMenu.hidden)) await openMenu();
      else await page.locator('#activity-back').click();
    }
    await page.locator('#activity-toggle').click();
    await page.waitForFunction(() => !$('activity-card').hidden);
  }

  async function activityView() {
    return page.evaluate(() => {
      const visible = element => !element.hidden && getComputedStyle(element).display !== 'none';
      const maid = document.getElementById('activity-list');
      const claude = document.getElementById('claude-activity-list');
      const buttons = element => [...element.querySelectorAll('button')].map(button => ({
        label: button.textContent, disabled: button.disabled,
      }));
      return {
        skin,
        maidShown: visible(maid),
        claudeShown: visible(claude),
        maid: buttons(maid),
        claude: buttons(claude),
        maidScroll: maid.scrollTop,
        claudeScroll: claude.scrollTop,
      };
    });
  }

  function assertOnly(view, skinName, labels) {
    assert.equal(view.skin, skinName);
    if (skinName === 'maid') {
      assert.equal(view.maidShown, true);
      assert.equal(view.claudeShown, false);
      assert.deepEqual(view.maid.map(button => button.label), labels);
      assert.equal(view.maid.some(button => button.disabled), false);
    } else {
      assert.equal(view.claudeShown, true);
      assert.equal(view.maidShown, false);
      assert.deepEqual(view.claude.map(button => button.label), labels);
      assert.equal(view.claude.some(button => button.disabled), false);
    }
    assert.equal(view.maidScroll, 0);
    assert.equal(view.claudeScroll, 0);
  }

  async function shoot(prefix) {
    const listId = await page.evaluate(() => skin === 'claude' ? 'claude-activity-list' : 'activity-list');
    const tops = await page.evaluate(id => {
      const list = document.getElementById(id);
      const max = Math.max(0, list.scrollHeight - list.clientHeight);
      return max === 0 ? [0] : [0, Math.round(max / 2), max];
    }, listId);
    const files = [];
    for (const [index, top] of tops.entries()) {
      await page.evaluate(({ id, top }) => { document.getElementById(id).scrollTop = top; }, { id: listId, top });
      const file = `/opt/cursor/artifacts/${prefix}-${index + 1}.png`;
      await page.screenshot({ path: file, omitBackground: true });
      files.push(file);
    }
    await page.evaluate(id => { document.getElementById(id).scrollTop = 0; }, listId);
    return files;
  }

  async function playLabel(skinName, label, filePart) {
    const selector = skinName === 'claude'
      ? `#claude-activity-list button`
      : `#activity-list button`;
    await page.locator(selector, { hasText: label }).click();
    await page.waitForFunction(part => animation === 'interaction' && !videos.interaction.paused && Number.isFinite(videos.interaction.duration) && decodeURI(videos.interaction.src).includes(part), filePart);
    await page.evaluate(() => { videos.interaction.currentTime = videos.interaction.duration - .08; });
    await page.waitForFunction(() => animation === 'idle' && !videos.idle.paused);
  }

  try {
    await launch();
    await openMenu();
    await page.locator('#activity-toggle').click();
    assertOnly(await activityView(), 'maid', maidLabels);
    const maidShots = await shoot('maid-activity-menu');

    await page.evaluate(() => selectSkin('claude'));
    await page.waitForFunction(() => skin === 'claude' && !$('activity-card').hidden);
    assertOnly(await activityView(), 'claude', claudeLabels);
    const claudeShots = await shoot('claude-activity-menu');
    await playLabel('claude', '元气挥手', '/wave.webm');
    await openActivities();
    await playLabel('claude', '玩魔方', '/cube.webm');

    await openActivities();
    await page.evaluate(() => selectSkin('maid'));
    await page.waitForFunction(() => skin === 'maid' && !$('activity-card').hidden);
    assertOnly(await activityView(), 'maid', maidLabels);
    await page.evaluate(() => selectSkin('claude'));
    await page.waitForFunction(() => skin === 'claude');
    assertOnly(await activityView(), 'claude', claudeLabels);
    await page.evaluate(() => selectSkin('maid'));
    await page.waitForFunction(() => skin === 'maid');
    assertOnly(await activityView(), 'maid', maidLabels);
    await playLabel('maid', '挥挥手', '点击回应-元气挥手');
    await openActivities();
    await playLabel('maid', '玩魔方', '原地专心玩魔方');

    await openActivities();
    await page.evaluate(() => selectSkin('claude'));
    await page.waitForFunction(() => skin === 'claude' && !$('activity-card').hidden);
    assertOnly(await activityView(), 'claude', claudeLabels);
    await electron.close();
    electron = undefined;
    await launch();
    assert.equal(await page.evaluate(() => skin), 'claude');
    await openMenu();
    await page.locator('#activity-toggle').click();
    assertOnly(await activityView(), 'claude', claudeLabels);
    await page.locator('#activity-back').click();
    await page.locator('#skin-maid').click();
    await page.waitForFunction(() => skin === 'maid' && decodeURI(videos.idle.src).includes('待机呼吸休闲'));
    await electron.close();
    electron = undefined;
    await launch();
    assert.equal(await page.evaluate(() => skin), 'maid');
    await openMenu();
    await page.locator('#activity-toggle').click();
    assertOnly(await activityView(), 'maid', maidLabels);
    assert.deepEqual(errors, []);
    console.log('PASS 活动菜单随皮肤切换：女仆 106 项、Claude 25 项，打开中切换、来回切换和重启都不串列表。');
    console.log('SHOTS', JSON.stringify({ maidShots, claudeShots }));
  } finally {
    if (electron) await electron.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
