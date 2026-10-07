const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-idle-actions-ui-'));
  let electron;
  const errors = [];
  try {
    electron = await _electron.launch({ executablePath: require('electron'), args: ['.', '--user-data-dir=' + path.join(directory, 'profile')], cwd: process.cwd(), env: { ...process.env }, timeout: 60_000 });
    const page = await electron.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => typeof soundReady !== 'undefined');
    await page.evaluate(() => soundReady);
    await page.waitForFunction(() => state === 'idle', undefined, { timeout: 150_000 });
    await page.mouse.move(350, 10);
    await page.evaluate(() => {
      window.autoChecks = { plays: [], soundCalls: 0 };
      const videoPlay = videos.interaction.play.bind(videos.interaction);
      videos.interaction.play = function() {
        autoChecks.plays.push({ elapsed: performance.now() - autoChecks.started, src: decodeURI(this.src) });
        return videoPlay();
      };
      const soundPlay = clickSound.play.bind(clickSound);
      clickSound.play = function() { autoChecks.soundCalls++; return soundPlay(); };
      closeMenu(); scheduleIdleAction(); autoChecks.started = performance.now();
    });
    assert.equal(await page.evaluate(() => idleActionDelay), 60_000);
    console.log('WAIT 开始实际 60 秒待机计时（未缩短生产计时器）');
    await page.waitForTimeout(55_000);
    assert.equal(await page.evaluate(() => autoChecks.plays.length), 0, '55 秒不能提前触发');
    await page.waitForFunction(() => autoChecks.plays.length === 1 && animation === 'interaction' && !videos.interaction.paused && videos.interaction.currentTime > .1, undefined, { timeout: 20_000 });
    const first = await page.evaluate(() => ({ play: autoChecks.plays[0], allowed: Object.values(actions).some(action => autoChecks.plays[0].src.endsWith('/' + action.video + '.webm')), loop: videos.interaction.loop }));
    assert.ok(first.play.elapsed >= 59_990); assert.equal(first.allowed, true); assert.equal(first.loop, false);
    await page.waitForFunction(() => animation === 'idle' && videos.idle.loop && !videos.idle.paused, undefined, { timeout: 20_000 });
    assert.equal(await page.evaluate(() => autoChecks.soundCalls), 0);
    console.log('PASS 实际等待 ' + Math.round(first.play.elapsed) + 'ms 后随机播放现有动作，完整播完真实 ended 回待机，无点击音效');

    // 以下仅控制测试页的 60 秒 timeout 回调，快速覆盖状态边界；视频仍真实解码。
    await page.evaluate(() => {
      clearTimeout(idleActionTimer);
      window.autoClock = { pending: new Map(), next: 1_000_000, set: window.setTimeout.bind(window), clear: window.clearTimeout.bind(window) };
      window.setTimeout = (fn, delay, ...args) => {
        if (delay !== idleActionDelay) return autoClock.set(fn, delay, ...args);
        const id = ++autoClock.next; autoClock.pending.set(id, { fn, delay }); return id;
      };
      window.clearTimeout = id => { if (!autoClock.pending.delete(id)) autoClock.clear(id); };
      window.fireAutoClock = () => {
        const [id, timer] = [...autoClock.pending][0]; autoClock.pending.delete(id); timer.fn();
      };
      scheduleIdleAction();
    });
    async function pending(count) { assert.equal(await page.evaluate(() => autoClock.pending.size), count); }
    await pending(1);
    await page.evaluate(() => { window.oldAutoTimer = idleActionTimer; scheduleIdleAction(); });
    assert.notEqual(await page.evaluate(() => idleActionTimer), await page.evaluate(() => oldAutoTimer));
    await pending(1);
    await page.evaluate(() => {
      const random = Math.random; Math.random = () => .999999;
      try { fireAutoClock(); } finally { Math.random = random; }
    });
    await page.waitForFunction(() => animation === 'interaction' && !videos.interaction.paused && videos.interaction.currentTime > .1);
    assert.equal(await page.evaluate(() => decodeURI(videos.interaction.src).endsWith('/' + actions[idleActions.at(-1)].video + '.webm')), true, '随机索引上界可选择最后一个动作');
    await pending(0);
    async function endAction() {
      await page.evaluate(() => { videos.interaction.currentTime = videos.interaction.duration - .15; });
      await page.waitForFunction(() => animation === 'idle' && !videos.idle.paused);
      await pending(1);
      assert.deepEqual(await page.evaluate(() => [...autoClock.pending.values()].map(timer => timer.delay)), [60_000]);
    }
    await endAction();
    await page.evaluate(() => interact('stretch'));
    await page.waitForFunction(() => animation === 'interaction' && videos.interaction.currentTime > .1);
    await pending(0); await endAction();
    await page.evaluate(() => openMenu()); await pending(0);
    await page.evaluate(() => closeMenu()); await pending(1);
    await page.evaluate(() => showBubble('测试提示')); await pending(0);
    await page.evaluate(() => { bubble.hidden = true; updateRegions(); }); await pending(1);
    for (const next of ['receiving', 'checking', 'choosing', 'converting', 'success', 'error']) {
      const result = await page.evaluate(next => {
        const expired = [...autoClock.pending.values()][0].fn;
        const before = autoChecks.plays.length;
        setState(next); const expected = animation; expired();
        return { unchanged: expected === animation && autoChecks.plays.length === before, pending: autoClock.pending.size };
      }, next);
      assert.equal(result.unchanged, true); assert.equal(result.pending, 0);
      await page.evaluate(() => setState('idle')); await pending(1);
    }
    for (const flag of ['moving', 'dragDepth', 'soundChanging']) {
      await page.evaluate(flag => { if (flag === 'moving') moving = {}; if (flag === 'dragDepth') dragDepth = 1; if (flag === 'soundChanging') soundChanging = true; scheduleIdleAction(); }, flag);
      await pending(0);
      await page.evaluate(() => { moving = undefined; dragDepth = 0; soundChanging = false; scheduleIdleAction(); }); await pending(1);
    }
    await electron.evaluate(({ Menu }) => { Menu.prototype.popup = function(options) { globalThis.closeAutoMenu = options.callback; }; });
    await page.locator('#pet').click({ button: 'right', position: { x: 59, y: 67 } });
    await page.waitForFunction(() => actionMenuOpen); await pending(0);
    await electron.evaluate(() => closeAutoMenu());
    await page.waitForFunction(() => !actionMenuOpen); await pending(1);
    assert.equal(await page.evaluate(() => autoChecks.soundCalls), 0);
    assert.deepEqual(errors, []);
    console.log('PASS 手动动作与自动动作结束重新计时、重复调度仅一个计时器、菜单/原生菜单/提示卡片/拖动/文件拖入/音效切换暂停、所有处理状态和过期回调不能打断动画');
  } finally {
    if (electron) await electron.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
