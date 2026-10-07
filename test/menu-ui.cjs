const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-menu-ui-'));
  const artifacts = path.resolve('artifacts');
  const mp3 = path.join(directory, '我的小黄鸭.mp3');
  const wav = path.join(directory, '轻响.wav');
  const bad = path.join(directory, '坏音频.mp3');
  await fs.mkdir(artifacts, { recursive: true });
  await fs.copyFile(path.resolve('assets/duck-sound/Ya1.mp3'), mp3);
  await fs.writeFile(bad, 'not audio');
  // 生成一段可实际解码的 0.4 秒 PCM WAV，验证第二种支持的格式。
  const samples = 3200;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / 8000) * 2000), 44 + i * 2);
  await fs.writeFile(wav, bytes);
  let electron;
  let page;
  let saved;
  let audioSrc;
  const errors = [];
  async function launch() {
    electron = await _electron.launch({ executablePath: require('electron'), args: ['.', '--user-data-dir=' + path.join(directory, 'profile')], cwd: process.cwd(), env: { ...process.env } });
    page = await electron.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => typeof soundReady !== 'undefined');
    await page.evaluate(() => soundReady);
    await page.waitForFunction(() => state !== 'checking', undefined, { timeout: 150_000 });
    saved = path.join(await electron.evaluate(({ app }) => app.getPath('userData')), 'click-sound.json');
  }
  async function importFile(filePath) {
    await electron.evaluate(({ dialog }, value) => { dialog.showOpenDialog = async () => value ? { canceled: false, filePaths: [value] } : { canceled: true, filePaths: [] }; }, filePath);
    await page.locator('#sound-import').click();
    await page.waitForFunction(() => !soundChanging);
  }
  async function openByHover() {
    await page.locator('#pet').hover({ position: { x: 59, y: 67 } });
    await page.locator('#menu-toggle').hover();
    const card = await page.locator('#pet-menu').boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  }
  try {
    await launch();
    await page.mouse.move(350, 10);
    await page.waitForFunction(() => document.getElementById('menu-toggle').hidden && petMenu.hidden);
    assert.equal(await page.locator('#menu-toggle').isVisible(), false);
    assert.equal(await page.locator('#pet-menu').isVisible(), false);
    assert.equal(await page.locator('body').innerText(), '');
    // 旧响应区中的空白现在不能触发人物悬停、点击或拖动。
    await page.waitForFunction(() => animation === 'idle', undefined, { timeout: 20_000 });
    await page.mouse.move(150, 300);
    await page.mouse.click(150, 300);
    assert.equal(await page.evaluate(() => animation), 'idle');
    assert.equal(await page.locator('#menu-toggle').isVisible(), false);
    assert.equal(await page.evaluate(() => moving === undefined), true);
    assert.notEqual(await page.evaluate(() => document.elementFromPoint(150, 300)?.id), 'pet');
    const geometry = await page.evaluate(() => {
      const box = element => { const r = element.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
      return { hit: box(document.getElementById('pet-area')), video: box(videos.idle) };
    });
    assert.deepEqual(geometry.hit, [171, 229, 118, 134]);
    assert.deepEqual(geometry.video, [102, 228, 256, 144], '视频位置和大小保持不变');
    // 保留真实 60ms 鼠标穿透轮询，只控制系统光标读数并记录原生开关。
    await electron.evaluate(({ BrowserWindow, screen, ipcMain }) => {
      const win = BrowserWindow.getAllWindows()[0];
      globalThis.hitProbe = { win, screen, ipcMain, bounds: win.getBounds(), cursor: screen.getCursorScreenPoint,
        setIgnore: win.setIgnoreMouseEvents, point: { x: 150, y: 300 } };
      hitProbe.listener = (_, regions) => { hitProbe.regions = regions; };
      ipcMain.on('pet:regions', hitProbe.listener);
      screen.getCursorScreenPoint = () => ({ x: hitProbe.bounds.x + hitProbe.point.x, y: hitProbe.bounds.y + hitProbe.point.y });
      win.setIgnoreMouseEvents = function(ignore, options) { hitProbe.ignore = ignore; return hitProbe.setIgnore.call(this, ignore, options); };
      // 强制轮询跨过边界，以捕获初始已穿透的状态。
      hitProbe.point = { x: 230, y: 300 };
    });
    try {
      await page.evaluate(() => updateRegions());
      // 初始光标可能已在人物上；先移出再移入，确保捕获的是一次实际原生切换。
      await electron.evaluate(() => { hitProbe.point = { x: 150, y: 300 }; });
      await page.waitForTimeout(150);
      await electron.evaluate(() => { hitProbe.point = { x: 230, y: 300 }; });
      await page.waitForTimeout(150);
      assert.equal(await electron.evaluate(() => hitProbe.ignore), false);
      assert.deepEqual(await electron.evaluate(() => hitProbe.regions), [[171, 229, 118, 134]]);
      await electron.evaluate(() => { hitProbe.point = { x: 150, y: 300 }; });
      await page.waitForTimeout(150);
      assert.equal(await electron.evaluate(() => hitProbe.ignore), true, '原透明空白穿透到下方应用');
      await page.locator('#pet').hover({ position: { x: 59, y: 67 } });
      await electron.evaluate(() => { hitProbe.point = { x: 300, y: 282 }; });
      await page.waitForTimeout(150);
      assert.equal(await electron.evaluate(() => hitProbe.ignore), false, '人物矩形之外的气泡仍可响应');
      assert.deepEqual(await electron.evaluate(() => hitProbe.regions), [[171, 229, 118, 134], [272, 267, 30, 30]]);
    } finally {
      await electron.evaluate(() => {
        hitProbe.screen.getCursorScreenPoint = hitProbe.cursor;
        hitProbe.win.setIgnoreMouseEvents = hitProbe.setIgnore;
        hitProbe.ipcMain.removeListener('pet:regions', hitProbe.listener);
        delete globalThis.hitProbe;
      });
    }
    console.log('PASS 人物响应矩形缩小、视频大小位置不变、空白不触发人物、原生穿透轮询与独立气泡响应。');
    await page.mouse.move(350, 10);
    await page.waitForFunction(() => document.getElementById('menu-toggle').hidden);
    await page.screenshot({ path: path.join(artifacts, 'pet-hover-only.png'), omitBackground: true });
    assert.equal(await page.evaluate(() => soundSettings.selected), 'duck');
    await page.locator('#pet').hover({ position: { x: 59, y: 67 } });
    assert.equal(await page.locator('#menu-toggle').isVisible(), true);
    assert.equal(await page.locator('#pet-menu').isVisible(), false, '悬停人物只显示小气泡');
    await page.screenshot({ path: path.join(artifacts, 'pet-hover-button.png'), omitBackground: true });
    await page.locator('#menu-toggle').hover();
    assert.equal(await page.locator('#pet-menu').isVisible(), true, '悬停气泡无需点击即打开菜单');
    // 穿过右侧气泡与上方卡片之间的间隙，卡片不能提前收起。
    const toggleBox = await page.locator('#menu-toggle').boundingBox();
    const cardBox = await page.locator('#pet-menu').boundingBox();
    await page.mouse.move(toggleBox.x + toggleBox.width / 2, (cardBox.y + cardBox.height + toggleBox.y) / 2);
    await page.waitForTimeout(60);
    // 直接移动，避免 locator 等入场动画稳定时耗尽 180ms 间隙缓冲。
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.waitForTimeout(230);
    assert.equal(await page.locator('#pet-menu').isVisible(), true);
    await page.mouse.move(350, 10);
    await page.waitForFunction(() => petMenu.hidden && document.getElementById('menu-toggle').hidden);
    assert.equal(await page.locator('body').innerText(), '', '鼠标移走后仅人物');
    await openByHover();
    await page.locator('#pet').hover({ position: { x: 59, y: 67 } });
    await page.waitForFunction(() => petMenu.hidden);
    assert.equal(await page.locator('#menu-toggle').isVisible(), true, '移回人物收起菜单，保留悬停气泡');
    await openByHover();
    assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'true');
    console.log('PASS 默认仅人物、悬停人物显示气泡、悬停气泡打开菜单、跨越间隙与卡片停留、离开卡片/人物自动收起。');
    const layout = await page.evaluate(() => {
      const menu = petMenu.getBoundingClientRect();
      const toggle = document.getElementById('menu-toggle').getBoundingClientRect();
      return { menuInside: menu.x >= 0 && menu.y >= 0 && menu.right <= innerWidth && menu.bottom <= innerHeight,
        menuAboveButton: menu.bottom < toggle.top, toggleOnRight: toggle.left > document.getElementById('pet').getBoundingClientRect().x + document.getElementById('pet').getBoundingClientRect().width / 2,
        toggleSize: [toggle.width, toggle.height], filter: getComputedStyle(petMenu).backdropFilter };
    });
    assert.equal(layout.menuInside && layout.menuAboveButton && layout.toggleOnRight, true);
    assert.deepEqual(layout.toggleSize, [30, 30]);
    assert.match(layout.filter, /blur/);
    assert.equal(await electron.evaluate(({ BrowserWindow, ipcMain }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const listeners = ipcMain.listeners('pet:regions');
      return listeners.length > 0 && win.isAlwaysOnTop();
    }), true);
    await page.screenshot({ path: path.join(artifacts, 'pet-menu.png'), omitBackground: true });
    assert.equal(await page.locator('#activity-card').isVisible(), false, '默认不展开活动列表');
    await page.locator('#activity-toggle').hover();
    assert.equal(await page.locator('#activity-card').isVisible(), false, '活动入口仅悬停不展开');
    await page.locator('#activity-toggle').click();
    assert.equal(await page.locator('#activity-card').isVisible(), true, '点击活动打开列表卡片');
    assert.equal(await page.locator('#menu-home').isVisible(), false);
    assert.equal(await page.locator('#activity-toggle').getAttribute('aria-expanded'), 'true');
    const activityLabels = await page.locator('#activity-list button').allTextContents();
    assert.deepEqual(activityLabels.slice(0, 3), ['挥挥手', '伸个懒腰', '玩魔方']);
    assert.equal(activityLabels.at(-1), '回到待机');
    assert.equal(activityLabels.length, Object.keys(require('../src/actions.js')).length + 1);
    const listLayout = await page.locator('#activity-list button').evaluateAll(buttons => buttons.map(button => {
      const box = button.getBoundingClientRect(); return { x: box.x, y: box.y };
    }));
    assert.ok(listLayout.every(button => Math.abs(button.x - listLayout[0].x) < 1));
    assert.ok(listLayout.slice(1).every((button, index) => button.y > listLayout[index].y));
    await page.screenshot({ path: path.join(artifacts, 'pet-activity-list.png'), omitBackground: true });
    await page.locator('#activity-back').click();
    assert.equal(await page.locator('#menu-home').isVisible(), true, '返回恢复声音与退出');
    for (const [action, name] of [['wave', '元气挥手'], ['stretch', '伸懒腰'], ['cube', '玩魔方']]) {
      await openByHover();
      await page.locator('#activity-toggle').click();
      await page.locator(`[data-action="${action}"]`).click();
      await page.waitForFunction(() => animation === 'interaction' && !videos.interaction.paused && videos.interaction.currentTime > 0);
      assert.ok(decodeURI(await page.evaluate(() => videos.interaction.src)).includes(name));
      assert.equal(await page.locator('#pet-menu').isVisible(), false);
    }
    await openByHover();
    await page.locator('#activity-toggle').click();
    await page.locator('[data-action="idle"]').click();
    assert.equal(await page.evaluate(() => animation), 'idle');
    await openByHover();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#pet-menu').isVisible(), false);
    assert.equal(await page.locator('#pet').evaluate(element => getComputedStyle(element).outlineStyle), 'solid', 'Esc 返回人物时保留键盘焦点提示');
    await page.locator('#pet').click({ position: { x: 59, y: 67 } });
    assert.equal(await page.locator('#pet').evaluate(element => getComputedStyle(element).outlineStyle), 'none', '鼠标点击清除原有键盘焦点轮廓');
    await page.waitForFunction(() => animation === 'idle', undefined, { timeout: 20_000 });
    assert.equal(await page.locator('#pet').evaluate(element => getComputedStyle(element).outlineStyle), 'none', '不点击其他位置，动画结束后仍无绿色边框');
    // Chromium 会记住鼠标点击前的 Tab 起点；验证能到达人物，不假定固定两次。
    const tabTargets = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      tabTargets.push(await page.evaluate(() => document.activeElement.id));
      if (tabTargets.at(-1) === 'pet') break;
    }
    assert.equal(await page.locator('#pet').evaluate(element => element.matches(':focus-visible')), true, 'Tab 仍能聚焦人物并显示提示');
    console.log('Tab 焦点路径：' + tabTargets.join(' → '));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => animation === 'interaction' && !videos.interaction.paused);
    assert.equal(await page.locator('#pet').evaluate(element => getComputedStyle(element).outlineStyle), 'solid', '键盘互动保留焦点提示');
    await page.waitForFunction(() => animation === 'idle', undefined, { timeout: 20_000 });
    console.log('PASS Esc 后点击清除绿色轮廓，不点其他位置直到动画结束仍无框，Tab/Enter 键盘焦点和互动保留。');
    await openByHover();
    await page.locator('#menu-toggle').press('Enter');
    assert.equal(await page.locator('#pet-menu').isVisible(), true);

    await importFile(mp3);
    assert.equal(await page.evaluate(() => soundSettings.selected), 'custom');
    assert.equal(await page.locator('#sound-custom').textContent(), '我的小黄鸭.mp3');
    assert.equal(await page.locator('#sound-custom').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#menu-status').textContent(), /已切换/);
    audioSrc = await page.evaluate(() => clickSound.src);
    const originalSaved = await fs.readFile(saved, 'utf8');
    await importFile(null);
    assert.match(await page.locator('#menu-status').textContent(), /取消/);
    assert.equal(await page.evaluate(() => clickSound.src), audioSrc);
    await importFile(bad);
    assert.match(await page.locator('#menu-status').textContent(), /无法播放/);
    assert.equal(await page.evaluate(() => clickSound.src), audioSrc);
    assert.equal(await fs.readFile(saved, 'utf8'), originalSaved, '无效音频不替换已保存音效');
    const backup = saved + '.backup';
    await fs.rename(saved, backup);
    await fs.mkdir(saved);
    await importFile(wav);
    assert.match(await page.locator('#menu-status').textContent(), /保存失败/);
    assert.equal(await page.evaluate(() => clickSound.src), audioSrc, '保存失败保留当前音效');
    assert.equal(await fs.readFile(backup, 'utf8'), originalSaved);
    await fs.rmdir(saved);
    await fs.rename(backup, saved);
    await page.locator('#sound-duck').click();
    await page.waitForFunction(() => !soundChanging);
    assert.equal(await page.evaluate(() => soundSettings.selected), 'duck');
    assert.equal(await page.locator('#sound-custom').isVisible(), true);
    await page.locator('#sound-custom').click();
    await page.waitForFunction(() => !soundChanging);
    assert.equal(await page.evaluate(() => clickSound.src), audioSrc);
    await importFile(wav);
    assert.equal(await page.locator('#sound-custom').textContent(), '轻响.wav');
    await page.waitForFunction(() => clickSound.readyState >= 2);
    assert.ok(Math.abs(await page.evaluate(() => clickSound.duration) - .4) < .01);
    assert.deepEqual(await fs.readFile(wav), bytes, '导入不修改原文件');
    await page.screenshot({ path: path.join(artifacts, 'pet-menu-custom-sound.png'), omitBackground: true });
    audioSrc = await page.evaluate(() => clickSound.src);
    await electron.close();
    electron = undefined;
    await fs.unlink(wav);
    await launch();
    assert.equal(await page.evaluate(() => soundSettings.selected), 'custom');
    assert.equal(await page.evaluate(() => clickSound.src), audioSrc, '重启并删除原文件后仍读取应用副本');
    await page.locator('#pet').click({ position: { x: 59, y: 67 } });
    await page.waitForFunction(() => !clickSound.paused && clickSound.currentTime > 0);
    await page.waitForFunction(() => clickSound.ended);
    await openByHover();
    await page.locator('#sound-duck').click();
    await page.waitForFunction(() => !soundChanging);
    await electron.close();
    electron = undefined;
    await launch();
    assert.equal(await page.evaluate(() => soundSettings.selected), 'duck', '恢复默认也持久保存');
    assert.match(await page.evaluate(() => clickSound.src), /Ya1\.mp3$/);
    assert.equal(await page.evaluate(() => soundSettings.custom.name), '轻响.wav');

    // 检查菜单暂时隐藏转换卡片时，关闭菜单不会丢失原卡片。
    await page.evaluate(() => { showBubble('卡片保留检查', '临时提示'); });
    await openByHover();
    assert.equal(await page.locator('#bubble').isVisible(), false);
    await page.locator('#menu-close').click();
    assert.equal(await page.locator('#bubble').isVisible(), true);
    assert.equal(await page.locator('#bubble-title').textContent(), '卡片保留检查');
    await page.locator('#dismiss').click();

    // 真实进入保存阶段，主进程 busy 与渲染状态都要阻止退出。
    const doc = path.join(directory, 'test.doc');
    await fs.writeFile(doc, '{\\rtf1\\ansi MENU BUSY TEST}');
    await electron.evaluate(({ dialog }) => {
      dialog.showSaveDialog = () => new Promise(resolve => { globalThis.resolveMenuSave = resolve; });
    });
    await page.evaluate(() => {
      const input = document.createElement('input'); input.type = 'file'; input.id = 'menu-test-file'; input.hidden = true; document.body.append(input);
    });
    await page.locator('#menu-test-file').setInputFiles(doc);
    await page.evaluate(() => {
      const data = new DataTransfer(); data.items.add(document.getElementById('menu-test-file').files[0]);
      document.getElementById('pet-area').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
    });
    await page.waitForFunction(() => state === 'choosing');
    await page.locator('#format').click();
    await page.waitForFunction(() => state === 'converting');
    await openByHover();
    assert.equal(await page.locator('#menu-quit').isDisabled(), true);
    assert.equal(await page.locator('#sound-import').isDisabled(), true);
    assert.equal(await page.locator('[data-action="wave"]').isDisabled(), true);
    assert.equal(await page.locator('#activity-toggle').isDisabled(), true);
    assert.match(await page.locator('#menu-status').textContent(), /完成后可退出/);
    await page.evaluate(() => window.cat.quit());
    assert.equal(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1, '主进程也拒绝转换中退出');
    await electron.evaluate(() => resolveMenuSave({ canceled: true }));
    await page.waitForFunction(() => state === 'choosing');
    assert.equal(await page.locator('#menu-quit').isDisabled(), false);
    assert.deepEqual(errors, []);
    console.log('PASS 菜单布局/毛玻璃外观/活动/关闭与键盘、MP3/WAV 实际解码、取消与损坏文件保护、重启持久保存、删除原文件后副本可用、恢复默认、转换中禁用操作与退出。');
    if (!(await page.locator('#pet-menu').isVisible())) await openByHover();
    const closed = electron.waitForEvent('close');
    await page.locator('#menu-quit').click();
    await closed;
    electron = undefined;
    console.log('PASS 空闲点击菜单退出实际关闭应用。原生音频文件选择和保存对话框由测试替代。');
  } finally {
    if (electron) await electron.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
