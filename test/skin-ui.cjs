// 皮肤菜单：切换、持久保存、皮肤目录缺失动画回落到原装 dsh-pet。
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-skin-ui-'));
  const skinDir = path.resolve('assets/skins/hoodie');
  const probe = path.join(skinDir, '待机呼吸休闲.webm');
  // 测试用：把原装待机动画复制进皮肤目录，模拟“只换装了一个动作”。
  const hadProbe = await fs.access(probe).then(() => true, () => false);
  if (!hadProbe) await fs.copyFile(path.resolve('assets/dsh-pet/待机呼吸休闲.webm'), probe);
  let electron;
  const errors = [];
  async function launch() {
    electron = await _electron.launch({ executablePath: require('electron'), args: ['.', '--user-data-dir=' + path.join(directory, 'profile')], cwd: process.cwd() });
    const page = await electron.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => typeof skinReady !== 'undefined');
    await page.evaluate(() => skinReady);
    await page.waitForFunction(() => state !== 'checking', undefined, { timeout: 150_000 });
    return page;
  }
  async function openSkins(page) {
    await page.locator('#pet').hover({ position: { x: 59, y: 67 } });
    await page.locator('#menu-toggle').hover();
    await page.locator('#skin-toggle').click();
    assert.equal(await page.locator('#skin-card').isVisible(), true);
  }
  try {
    let page = await launch();
    assert.equal(await page.evaluate(() => skinState.selected), 'classic');
    await openSkins(page);
    assert.deepEqual(await page.locator('#skin-list b').allTextContents(), ['蓝毛女仆', '奶油卫衣']);
    assert.equal(await page.locator('[data-skin="classic"]').getAttribute('aria-checked'), 'true');
    await fs.mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/pet-skin-menu.png', omitBackground: true });
    await page.locator('[data-skin="hoodie"]').click();
    await page.waitForFunction(() => skinState.selected === 'hoodie' && !skinChanging);
    assert.equal(await page.locator('[data-skin="hoodie"]').getAttribute('aria-checked'), 'true');
    const sources = await page.evaluate(() => ({ idle: decodeURI(videos.idle.src), working: decodeURI(videos.working.src), wave: decodeURI(videoUrl('点击回应-元气挥手')) }));
    assert.match(sources.idle, /skins\/hoodie\/待机呼吸休闲\.webm$/, '皮肤已有的动画使用皮肤版本');
    assert.match(sources.working, /dsh-pet\/工作状态-忙碌点按\.webm$/, '皮肤缺少的动画回落原装');
    assert.match(sources.wave, /dsh-pet\//);
    await page.waitForFunction(() => !videos.idle.paused || !videos.interaction.paused);
    console.log('PASS 皮肤列表、单选状态、切换后动画来源与缺失动画回落。');
    await electron.close();
    page = await launch();
    assert.equal(await page.evaluate(() => skinState.selected), 'hoodie', '重启后保留皮肤');
    assert.match(decodeURI(await page.evaluate(() => videos.idle.src)), /skins\/hoodie\//);
    await openSkins(page);
    await page.locator('[data-skin="classic"]').click();
    await page.waitForFunction(() => skinState.selected === 'classic' && !skinChanging);
    assert.match(decodeURI(await page.evaluate(() => videos.idle.src)), /dsh-pet\/待机呼吸休闲\.webm$/);
    const rejected = await page.evaluate(() => window.cat.selectSkin('../../etc').then(() => 'ok', error => error.message));
    assert.match(rejected, /没有这套皮肤/);
    console.log('PASS 重启持久保存、切回原装、拒绝无效皮肤 ID。');
    assert.deepEqual(errors, []);
  } finally {
    await electron?.close().catch(() => {});
    if (!hadProbe) await fs.unlink(probe).catch(() => {});
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
