const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require(process.argv[2] || process.env.PLAYWRIGHT_MODULE || 'playwright');
if (process.argv[3]) process.env.SOFFICE_PATH = process.argv[3];
const { probePdf } = require('../src/converter.cjs');

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cat-converter-ui-'));
  const artifacts = path.resolve('artifacts');
  await fs.mkdir(artifacts, { recursive: true });
  const doc = path.join(dir, '小猫测试.doc');
  const inputPdf = path.join(dir, '小猫测试.pdf');
  const bad = path.join(dir, 'unsupported.exe');
  const output = path.join(dir, 'result.pdf');
  await fs.writeFile(doc, '{\\rtf1\\ansi CAT CONVERTER UI TEST}');
  await fs.writeFile(inputPdf, probePdf());
  await fs.writeFile(bad, 'unsupported');
  const electron = await _electron.launch({ executablePath: require('electron'), args: ['.', '--user-data-dir=' + path.join(dir, 'profile')], cwd: path.resolve('.'), env: { ...process.env }, timeout: 60_000 });
  try {
    const page = await electron.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    async function checkCardPosition() {
      await page.waitForFunction(() => !bubble.getAnimations().some(animation => animation.playState === 'running'));
      const layout = await page.evaluate(() => {
        const card = bubble.getBoundingClientRect();
        const pet = petArea.getBoundingClientRect();
        return { top: card.top, left: card.left, right: card.right, bottom: card.bottom, gap: pet.top - card.bottom };
      });
      assert.ok(layout.top >= 12 && layout.left >= 0 && layout.right <= 360, '长短转换卡片均完整位于窗口内');
      assert.equal(layout.bottom, 216, '转换卡片底部固定在人物上方');
      assert.equal(layout.gap, 13, '转换卡片紧邻人物，短卡片也不贴窗口顶部');
    }
    assert.equal(await page.locator('#bubble').isVisible(), false, '启动时只显示人物');
    const windowInfo = await electron.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return { alwaysOnTop: win.isAlwaysOnTop(), background: win.getBackgroundColor(), prefs: win.webContents.getLastWebPreferences() };
    });
    assert.equal(windowInfo.alwaysOnTop, true);
    // 原生 getBackgroundColor 返回 RGB，不保留透明度。
    assert.match(windowInfo.background, /^#000000(?:00)?$/);
    assert.equal(windowInfo.prefs.contextIsolation, true);
    assert.equal(windowInfo.prefs.sandbox, true);
    assert.equal(windowInfo.prefs.nodeIntegration, false);
    await page.waitForFunction(() => state !== 'checking', undefined, { timeout: 150_000 });
    await page.mouse.move(350, 10);
    await page.waitForFunction(() => document.getElementById('menu-toggle').hidden);
    assert.equal(await page.locator('body').innerText(), '', '待机只显示人物');
    await page.evaluate(() => {
      document.getElementById('pet-area').dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true }));
    });
    assert.equal(await page.locator('body').innerText(), '', '文件拖入提示不增加常驻文字');
    await page.evaluate(() => document.getElementById('pet-area').dispatchEvent(new DragEvent('dragleave')));
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    const capabilities = await page.evaluate(() => ({ available: tool.available, pdfSupported: tool.pdfSupported }));
    assert.equal(capabilities.available, true, '本次动画验证需要 LibreOffice，不能跳过转换后宣称通过');
    await page.waitForFunction(() => Object.values(videos).every(video => video.readyState >= 2));
    await page.waitForFunction(() => clickSound.readyState >= 2);
    assert.equal(await page.evaluate(() => clickSound.paused && !clickSound.loop && clickSound.volume === .5 && clickSound.duration > 0), true, '小黄鸭音频可解码、默认静音等待点击、播放一次');
    await page.evaluate(() => {
      window.soundChecks = { calls: 0, ended: 0, starts: [], errors: 0 };
      clickSound.addEventListener('ended', () => window.soundChecks.ended++);
      clickSound.addEventListener('error', () => window.soundChecks.errors++);
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function(...args) {
        if (this === clickSound) {
          window.soundChecks.calls++;
          window.soundChecks.starts.push({ time: this.currentTime, paused: this.paused });
        }
        return originalPlay.apply(this, args);
      };
    });
    await page.evaluate(() => { checkTool(true); });
    assert.equal(await page.evaluate(() => state), 'checking');
    await page.locator('#pet').click({ force: true, position: { x: 59, y: 67 } });
    assert.equal(await page.evaluate(() => window.soundChecks.calls), 0, '检查工具期间左键不发声');
    await page.waitForFunction(() => state !== 'checking', undefined, { timeout: 150_000 });
    const media = await page.evaluate(() => Object.fromEntries(Object.entries(videos).map(([name, video]) => [name, {
      duration: video.duration, width: video.videoWidth, height: video.videoHeight,
      autoplay: video.autoplay, muted: video.muted, playsInline: video.playsInline,
      loop: video.loop, objectFit: getComputedStyle(video).objectFit,
    }])));
    for (const [name, video] of Object.entries(media)) {
      assert.ok(video.duration > 0 && video.width > 0 && video.height > 0, name + ' 可以解码');
      assert.equal(video.autoplay && video.muted && video.playsInline, true);
      assert.equal(video.loop, ['idle', 'working', 'drag'].includes(name));
      assert.equal(video.objectFit, 'contain');
    }
    const transparency = await page.evaluate(async () => {
      const results = {};
      for (const [name, video] of Object.entries(videos)) {
        video.pause();
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        // 隐藏视频没有布局，统一采用可见待机视频的尺寸。
        const visible = videos.idle.getBoundingClientRect();
        const frames = [];
        for (const time of [.1, video.duration * .25, video.duration * .5, video.duration * .75, video.duration - .1]) {
          await new Promise(resolve => {
            video.addEventListener('seeked', resolve, { once: true });
            video.currentTime = time;
          });
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(video, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let opaque = 0;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 16) opaque++;
          frames.push({ time, cornerAlpha: [pixels[3], pixels[(canvas.width - 1) * 4 + 3]], opaque });
        }
        results[name] = { frames, scaleX: visible.width / video.videoWidth, scaleY: visible.height / video.videoHeight,
          insideWindow: visible.x >= 0 && visible.y >= 0 && visible.right <= innerWidth && visible.bottom <= innerHeight };
      }
      videos.idle.currentTime = 0;
      await videos.idle.play();
      return results;
    });
    for (const [name, result] of Object.entries(transparency)) {
      assert.equal(result.insideWindow, true, name + ' 完整视频区域位于窗口内');
      assert.ok(Math.abs(result.scaleX - result.scaleY) < .001, name + ' 等比例显示');
      for (const frame of result.frames) {
        // 原始 WebM 的透明角像素解码为 alpha=1/255，允许最多 3/255 的微小残余。
        assert.ok(frame.cornerAlpha.every(alpha => alpha <= 3), name + ' 透明背景');
        assert.ok(frame.opaque > 1000 && frame.opaque < media[name].width * media[name].height * .8, name + ' 有角色且保留透明区域');
      }
    }
    await page.evaluate(() => {
      window.mediaChecks = { idleLoops: 0, workingLoops: 0, finishEnded: 0, workingPlayed: 0 };
      for (const name of ['idle', 'working']) {
        const video = videos[name];
        let lastTime = 0;
        video.addEventListener('timeupdate', () => {
          if (!video.hidden && lastTime > video.duration - .5 && video.currentTime < .5) window.mediaChecks[name + 'Loops']++;
          lastTime = video.currentTime;
        });
        video.addEventListener('seeked', () => { lastTime = video.currentTime; });
      }
      videos.working.addEventListener('playing', () => {
        window.mediaChecks.workingPlayed++;
        // 只缩短测试等待：跳到尾部，验证浏览器真实循环，不派发伪造的 ended。
        if (videos.working.currentTime < .1) videos.working.currentTime = videos.working.duration - .25;
      });
      videos.finish.addEventListener('ended', () => { window.mediaChecks.finishEnded++; });
      videos.idle.currentTime = videos.idle.duration - .25;
    });
    await page.waitForFunction(() => window.mediaChecks.idleLoops >= 1 && animation === 'idle' && !videos.idle.paused);
    await page.screenshot({ path: path.join(artifacts, 'pet-idle.png'), omitBackground: true });

    // 原生菜单选择在这里替代，右键事件、IPC、菜单构建和动画播放仍走真实代码。
    await electron.evaluate(({ Menu }) => {
      globalThis.petMenuChecks = { calls: 0, action: undefined, labels: [] };
      Menu.prototype.popup = function(options) {
        petMenuChecks.calls++;
        const leaves = menu => menu.items.flatMap(item => item.submenu ? leaves(item.submenu) : item.type === 'separator' ? [] : [item]);
        petMenuChecks.labels = leaves(this).map(item => item.label);
        if (petMenuChecks.action) this.getMenuItemById(petMenuChecks.action)?.click();
        options.callback();
      };
    });
    await page.locator('#pet').click({ position: { x: 59, y: 67 } });
    await page.waitForFunction(() => !clickSound.paused && clickSound.currentTime > 0);
    assert.equal(await page.evaluate(() => window.soundChecks.calls), 1, '空闲左键播放小黄鸭');
    await page.waitForFunction(() => window.soundChecks.ended === 1);
    assert.equal(await page.evaluate(() => clickSound.paused), true, '音效真实播放到末尾后停止');
    await page.waitForFunction(() => animation === 'interaction' && !videos.interaction.paused && videos.interaction.currentTime > 0);
    assert.equal(await page.locator('#bubble').isVisible(), false, '点击互动仍只显示人物');
    assert.equal(await page.evaluate(() => videos.interaction.loop), false);
    await page.screenshot({ path: path.join(artifacts, 'pet-interaction.png'), omitBackground: true });
    await page.waitForFunction(() => animation === 'idle', undefined, { timeout: 20_000 });
    // 连续点击仍使用同一个真实音频元素，每次暂停后从头播放，不产生重叠播放器。
    for (let i = 0; i < 3; i++) {
      await page.locator('#pet').click({ force: true, position: { x: 59, y: 67 } });
      await page.waitForFunction(() => !clickSound.paused && clickSound.currentTime > .05);
    }
    assert.equal(await page.evaluate(() => window.soundChecks.calls), 4);
    assert.equal(await page.evaluate(() => window.soundChecks.starts.every(start => start.time === 0 && start.paused)), true);
    await page.waitForFunction(() => clickSound.ended);
    await page.waitForFunction(() => animation === 'idle', undefined, { timeout: 20_000 });
    // 固定随机数仅用于覆盖每个点击候选，点击、音效及视频 ended 仍走真实链路。
    const clickVideos = ['点击回应-元气挥手', '东张西望', '点击回应-开心跃动', '点击回应-害羞惊讶', '点击回应-傲娇生气', '点击回应-挠痒咯咯笑'];
    assert.deepEqual(await page.evaluate(() => clickActions.map(action => actions[action].video)), clickVideos, '普通点击包含全部转向及点击回应，不包含其他类别');
    for (const [index, video] of clickVideos.entries()) {
      const soundCalls = await page.evaluate(() => window.soundChecks.calls);
      await page.evaluate(value => {
        window.originalClickRandom = Math.random;
        Math.random = () => value;
      }, (index + .5) / clickVideos.length);
      try {
        await page.locator('#pet').click({ force: true, position: { x: 59, y: 67 } });
      } finally {
        await page.evaluate(() => { Math.random = window.originalClickRandom; delete window.originalClickRandom; });
      }
      await page.waitForFunction(() => animation === 'interaction' && !videos.interaction.paused && videos.interaction.currentTime > .05 && !clickSound.paused);
      const response = await page.evaluate(() => ({
        video: decodeURI(videos.interaction.src).split('/').at(-1), loop: videos.interaction.loop,
        soundCalls: window.soundChecks.calls, squash: reducedMotion || bounce.effect.getKeyframes().some(frame => frame.transform === 'scale(1.06, 0.88)'),
        idleTimerPaused: idleActionTimer === undefined,
      }));
      assert.equal(response.video, video + '.webm');
      assert.equal(response.loop, false);
      assert.equal(response.soundCalls, soundCalls + 1, '每次点击只播放一次音效');
      assert.equal(response.squash, true, '保留原有压扁回弹，尊重减少动态效果设置');
      assert.equal(response.idleTimerPaused, true);
      await page.evaluate(() => new Promise(resolve => {
        videos.interaction.addEventListener('ended', resolve, { once: true });
        videos.interaction.currentTime = videos.interaction.duration - .08;
      }));
      await page.waitForFunction(() => animation === 'idle' && !videos.idle.paused && idleActionTimer !== undefined && clickSound.ended);
    }
    console.log('PASS 普通点击随机覆盖转向与点击回应全部 6 个动画，压扁效果及单次音效保留，真实 ended 回待机并恢复一分钟计时。');
    const idleSoundCalls = await page.evaluate(() => window.soundChecks.calls);
    // 拖动超过阈值时不能被识别为点击。
    const box = await page.locator('#pet').boundingBox();
    await page.mouse.move(box.x + 59, box.y + 67);
    await page.mouse.down();
    await page.mouse.move(box.x + 71, box.y + 67);
    await page.waitForFunction(() => animation === 'drag' && !videos.drag.paused && videos.drag.currentTime > .1);
    assert.equal(await page.evaluate(() => videos.drag.loop && decodeURI(videos.drag.src).includes('被鼠标拖拽悬空反馈')), true);
    assert.equal(await page.evaluate(() => idleActionTimer), undefined, '拖动暂停一分钟自动动作');
    await page.evaluate(() => new Promise(resolve => {
      videos.drag.addEventListener('seeked', resolve, { once: true });
      videos.drag.currentTime = videos.drag.duration - .25;
    }));
    await page.waitForFunction(() => animation === 'drag' && !videos.drag.paused && videos.drag.currentTime < .5);
    await page.evaluate(() => { window.dragEnded = 0; videos.drag.addEventListener('ended', () => window.dragEnded++); });
    const releaseStarted = performance.now();
    await page.mouse.up();
    assert.equal(await page.evaluate(() => animation), 'drag', '松手立即播放落地段，不触发点击动画');
    assert.equal(await page.evaluate(() => !videos.drag.loop && !videos.drag.paused && !videos.drag.hidden && idleActionTimer === undefined && moving === undefined), true, '松手停止窗口移动及循环');
    assert.ok(await page.evaluate(() => videos.drag.currentTime >= 8.5 && videos.drag.currentTime < 9), '松手跳过悬空等待，直接进入末尾落地段');
    // 不缩短剩余播放，不伪造 ended；测量真实落地耗时。
    await page.waitForFunction(() => animation === 'idle' && dragEnded === 1, undefined, { timeout: 3_000 });
    const landingMs = performance.now() - releaseStarted;
    assert.ok(landingMs >= 1_000 && landingMs < 3_000, '落地段完整播完，且不用等待整轮动画');
    assert.equal(await page.evaluate(() => videos.drag.ended && videos.drag.paused && videos.drag.hidden && idleActionTimer !== undefined), true, '放下动作播到末尾才回待机并重新计时');
    assert.equal(await page.evaluate(() => window.soundChecks.calls), idleSoundCalls, '拖动不发声');
    // 真实释放浏览器 pointer capture；取消事件和失焦使用测试事件检查收尾分支。
    await page.evaluate(() => document.getElementById('pet').addEventListener('pointerdown', event => { window.dragPointerId = event.pointerId; }));
    for (const end of ['capture', 'cancel', 'blur']) {
      await page.mouse.move(box.x + 59, box.y + 67);
      await page.mouse.down();
      await page.mouse.move(box.x + 71, box.y + 67);
      await page.waitForFunction(() => animation === 'drag' && !videos.drag.paused);
      await page.evaluate(end => {
        if (end === 'capture') document.getElementById('pet').releasePointerCapture(dragPointerId);
        if (end === 'cancel') document.getElementById('pet').dispatchEvent(new PointerEvent('pointercancel', { pointerId: dragPointerId }));
        if (end === 'blur') window.dispatchEvent(new Event('blur'));
      }, end);
      await page.waitForFunction(() => animation === 'drag' && moving === undefined && !videos.drag.loop && !videos.drag.paused);
      await page.mouse.up();
      assert.equal(await page.evaluate(() => window.soundChecks.calls), idleSoundCalls);
      assert.ok(await page.evaluate(() => videos.drag.currentTime >= 8.5), '取消/失去捕获/失焦也立即进入落地段');
      await page.waitForFunction(() => animation === 'idle' && videos.drag.ended && videos.drag.paused, undefined, { timeout: 3_000 });
    }
    // 落地过程再次拖拽仍按原有方式恢复循环；每次松手立即播放落地段。
    for (let i = 0; i < 2; i++) {
      await page.mouse.move(box.x + 59, box.y + 67);
      await page.mouse.down();
      await page.mouse.move(box.x + 71, box.y + 67);
      await page.waitForFunction(() => animation === 'drag' && videos.drag.loop && !videos.drag.paused && videos.drag.currentTime > .1);
      await page.mouse.up();
      assert.equal(await page.evaluate(() => animation === 'drag' && !videos.drag.loop && videos.drag.currentTime >= 8.5 && videos.drag.currentTime < 9), true, '重复松手也直接进入落地段');
    }
    await page.waitForFunction(() => animation === 'idle' && videos.drag.ended && idleActionTimer !== undefined, undefined, { timeout: 3_000 });
    assert.equal(await page.evaluate(() => window.soundChecks.calls), idleSoundCalls, '放下及重新拖拽均不触发点击音效');
    console.log('PASS 拖拽开始及真实循环保留、松手直接播放落地段并真实 ended 回待机（耗时 ' + Math.round(landingMs) + 'ms）、重新拖拽恢复循环、取消/失去捕获/失焦立即落地、不误触点击和音效、恢复一分钟计时。');
    await page.locator('#pet').click({ button: 'right', position: { x: 59, y: 67 } });
    const actionLabels = await electron.evaluate(() => petMenuChecks.labels);
    assert.deepEqual(actionLabels.slice(0, 3), ['挥挥手', '伸个懒腰', '玩魔方']);
    assert.equal(actionLabels.at(-1), '回到待机');
    assert.equal(actionLabels.length, Object.keys(require('../src/actions.js')).length + 1);
    assert.equal(await page.evaluate(() => animation), 'idle', '取消菜单不播放动作');
    for (const [action, fileName] of [['stretch', '超大伸懒腰'], ['cube', '原地专心玩魔方'], ['wave', '点击回应-元气挥手']]) {
      await electron.evaluate((_, value) => { petMenuChecks.action = value; }, action);
      await page.locator('#pet').click({ button: 'right', position: { x: 59, y: 67 } });
      await page.waitForFunction(() => animation === 'interaction' && !videos.interaction.paused && videos.interaction.currentTime > 0);
      assert.ok(decodeURI(await page.locator('#cat-interaction').getAttribute('src')).includes(fileName));
      assert.equal(await page.locator('#bubble').isVisible(), false);
      await page.waitForFunction(() => animation === 'idle', undefined, { timeout: 20_000 });
    }
    await page.locator('#pet').press('Enter');
    await page.waitForFunction(() => animation === 'interaction');
    await electron.evaluate(() => { petMenuChecks.action = 'idle'; });
    await page.locator('#pet').click({ button: 'right', position: { x: 59, y: 67 } });
    await page.waitForFunction(() => animation === 'idle');
    assert.equal(await page.evaluate(() => window.soundChecks.calls), idleSoundCalls, '右键动作和键盘回应不发声');
    console.log('PASS 小黄鸭真实解码/播放/ended、连续左键从头播放、拖动/右键/键盘/检查工具不发声。');
    console.log('PASS 点击回应播放一次后回待机、拖动不误触、右键动作选择/取消/回待机、键盘回应。原生菜单选项选择由测试替代。');

    // 浏览器的文件选择器提供真实磁盘 File，随后派发 drop，执行同一条接收链路。
    // 这不是 Finder 原生拖拽验证，原生拖拽需单独人工或桌面自动化检查。
    async function drop(filePath) {
      await page.evaluate(() => {
        document.getElementById('test-file')?.remove();
        const input = document.createElement('input');
        input.id = 'test-file'; input.type = 'file'; input.hidden = true;
        document.body.append(input);
      });
      await page.locator('#test-file').setInputFiles(filePath);
      await page.evaluate(() => {
        const data = new DataTransfer();
        data.items.add(document.getElementById('test-file').files[0]);
        document.getElementById('pet-area').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
      });
    }

    await drop(bad);
    await page.waitForFunction(() => state === 'error');
    assert.match(await page.locator('#message').textContent(), /只接收/);
    await page.locator('#dismiss').click();
    await page.mouse.move(350, 10);
    await page.waitForFunction(() => document.getElementById('menu-toggle').hidden);
    assert.equal(await page.locator('body').innerText(), '', '关闭气泡后只显示人物');
    await drop(doc);
    await page.waitForFunction(() => document.getElementById('pet-area').classList.contains('receiving'));
    await page.locator('#pet').click({ force: true, position: { x: 59, y: 67 } });
    assert.equal(await page.evaluate(() => window.soundChecks.calls), idleSoundCalls, '接收文件期间左键不发声');
    assert.equal(await page.locator('#file-token').isVisible(), true);
    await page.screenshot({ path: path.join(artifacts, 'pet-receiving.png'), omitBackground: true });
    await page.waitForFunction(() => state === 'choosing');
    assert.equal(await page.locator('#bubble').isVisible(), true, '拖入文件后显示格式卡片');
    assert.equal(await page.locator('#bubble-title').textContent(), '要转换为什么格式鲸');
    assert.equal(await page.locator('#format-label').textContent(), 'PDF 文档');
    await checkCardPosition();
    const bounds = await page.evaluate(() => {
      const b = document.getElementById('bubble').getBoundingClientRect();
      const c = document.getElementById('pet').getBoundingClientRect();
      return { bubble: { x: b.x, y: b.y, right: b.right, bottom: b.bottom }, cat: { x: c.x, y: c.y } };
    });
    assert.ok(bounds.bubble.x < bounds.cat.x && bounds.bubble.y < bounds.cat.y);
    assert.ok(bounds.bubble.right <= 360 && bounds.bubble.bottom <= 228, '气泡不能超出窗口或盖住小猫');
    await page.screenshot({ path: path.join(artifacts, 'pet-format.png'), omitBackground: true });
    await page.evaluate(() => showFormats('较长转换错误说明鲸。'.repeat(100)));
    await checkCardPosition();
    assert.equal(await page.locator('.bubble-content').evaluate(element => element.scrollHeight > element.clientHeight), true, '长错误说明在卡片内滚动');
    await page.evaluate(() => showFormats());

    if (capabilities.available) {
      await electron.evaluate(({ dialog }) => { dialog.showSaveDialog = async (_, options) => { globalThis.saveTitle = options.title; return { canceled: true }; }; });
      await page.locator('#format').click();
      await page.waitForFunction(() => state === 'choosing' && document.getElementById('message').textContent.includes('取消'));
      assert.match(await page.locator('#message').textContent(), /取消/);
      assert.match(await page.locator('#message').textContent(), /鲸/);
      assert.equal(await electron.evaluate(() => globalThis.saveTitle), '保存转换结果鲸');
      assert.equal(await page.evaluate(() => animation), 'idle');
      assert.equal(await page.evaluate(() => window.mediaChecks.workingPlayed), 0, '取消保存不播放工作动画');

      await fs.writeFile(output, 'EXISTING OUTPUT MUST REMAIN');
      await electron.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, output);
      await page.locator('#format').click();
      await page.waitForFunction(() => state === 'choosing' && document.getElementById('message').textContent.includes('已经存在'), undefined, { timeout: 150_000 });
      assert.equal(await fs.readFile(output, 'utf8'), 'EXISTING OUTPUT MUST REMAIN');
      assert.equal(await page.evaluate(() => animation), 'idle', '转换失败返回待机');
      assert.match(await page.locator('#message').textContent(), /已经存在/);
      assert.match(await page.locator('#message').textContent(), /鲸/);
      await checkCardPosition();
      await page.screenshot({ path: path.join(artifacts, 'pet-failure.png'), omitBackground: true });
      await fs.unlink(output);
      await page.locator('#pet').click({ position: { x: 59, y: 67 } });
      await page.waitForFunction(() => !clickSound.paused && clickSound.currentTime > 0);
      assert.equal(await page.evaluate(() => window.soundChecks.calls), idleSoundCalls + 1, '转换失败恢复空闲后可发声');
      await page.locator('#format').click();
      assert.equal(await page.evaluate(() => clickSound.paused && clickSound.currentTime === 0), true, '开始转换立即停止音效');
      await page.waitForFunction(() => animation === 'working' && !videos.working.paused && videos.working.currentTime > 0);
      assert.equal(await page.locator('#bubble-title').textContent(), '正在转换鲸');
      assert.equal(await page.locator('#message').textContent(), '正在本机转换，请稍等鲸。');
      await checkCardPosition();
      const menuCalls = await electron.evaluate(() => petMenuChecks.calls);
      await page.locator('#pet').click({ position: { x: 59, y: 67 } });
      await page.locator('#pet').click({ button: 'right', position: { x: 59, y: 67 } });
      assert.equal(await page.evaluate(() => animation), 'working', '点击不打断转换动画');
      await page.mouse.move(box.x + 59, box.y + 67);
      await page.mouse.down();
      await page.mouse.move(box.x + 71, box.y + 67);
      assert.equal(await page.evaluate(() => animation), 'working', '拖拽不抢占转换动画');
      await page.mouse.up();
      assert.equal(await page.evaluate(() => animation), 'working', '转换中松手仍保持工作动画');
      assert.equal(await electron.evaluate(() => petMenuChecks.calls), menuCalls, '转换中不开动作菜单');
      assert.equal(await page.evaluate(() => window.soundChecks.calls), idleSoundCalls + 1, '转换中左键不发声');
      await page.screenshot({ path: path.join(artifacts, 'pet-working.png'), omitBackground: true });
      await page.waitForFunction(() => state === 'success', undefined, { timeout: 150_000 });
      assert.equal(await page.locator('#bubble-title').textContent(), '转换好啦鲸');
      await checkCardPosition();
      assert.equal(await page.evaluate(() => animation), 'finish');
      await page.locator('#pet').click({ position: { x: 59, y: 67 } });
      assert.equal(await page.evaluate(() => animation), 'finish', '点击不打断成功结束动画');
      await page.mouse.move(box.x + 59, box.y + 67);
      await page.mouse.down();
      await page.mouse.move(box.x + 71, box.y + 67);
      assert.equal(await page.evaluate(() => animation), 'finish', '拖拽不抢占成功结束动画');
      await page.mouse.up();
      assert.equal(await page.evaluate(() => animation), 'finish', '成功动画期间松手不会提前回待机');
      assert.equal(await page.evaluate(() => window.soundChecks.calls), idleSoundCalls + 1, '成功结束动画期间左键不发声');
      assert.match(await fs.readFile(output, 'utf8'), /^%PDF-/);
      assert.equal(await fs.readFile(doc, 'utf8'), '{\\rtf1\\ansi CAT CONVERTER UI TEST}');
      assert.equal(await page.locator('#reveal').isVisible(), true);
      await page.screenshot({ path: path.join(artifacts, 'pet-success.png'), omitBackground: true });
      await page.waitForFunction(() => window.mediaChecks.finishEnded === 1 && animation === 'idle' && !videos.idle.paused,
        undefined, { timeout: Math.ceil(media.finish.duration * 1000) + 10_000 });
      assert.equal(await page.evaluate(() => videos.finish.paused && videos.finish.hidden), true);
      assert.ok(await page.evaluate(() => window.mediaChecks.workingLoops) >= 1, '工作动画实际循环');
      await page.screenshot({ path: path.join(artifacts, 'pet-returned-idle.png'), omitBackground: true });
      await page.locator('#pet').click({ position: { x: 59, y: 67 } });
      await page.waitForFunction(() => !clickSound.paused && clickSound.currentTime > 0);
      assert.equal(await page.evaluate(() => window.soundChecks.calls), idleSoundCalls + 2, '成功回待机后恢复左键发声');
      console.log('PASS 待机实际循环、转换时工作动画循环、结束动画真实 ended 后回待机、转换失败显示中文原因并回待机。');
      console.log('PASS 接收/转换/成功动画不发声、进入转换停止声音、成功和失败恢复空闲后可发声。');
      console.log('视频信息：' + JSON.stringify(media));
    }

    await drop(inputPdf);
    await page.waitForFunction(() => state === 'choosing');
    assert.equal(await page.locator('#format-label').textContent(), 'Word 文档');
    assert.equal(await page.locator('#pdf-warning').isVisible(), true);
    await checkCardPosition();
    assert.equal(await page.locator('#format').isDisabled(), !capabilities.pdfSupported);
    await page.screenshot({ path: path.join(artifacts, 'pet-pdf-format.png'), omitBackground: true });
    if (capabilities.pdfSupported) {
      const word = path.join(dir, 'result.docx');
      await electron.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, word);
      await page.locator('#format').click();
      await page.waitForFunction(() => state === 'success', undefined, { timeout: 150_000 });
      const { wordXml } = require('../src/converter.cjs');
      assert.ok((await wordXml(word)).includes('CAT_PDF_IMPORT_CHECK'));
    }
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => window.soundChecks.errors), 0, '音频无加载错误');
    console.log('PASS 基础和点击动画抽样透明像素、等比例与窗口内完整显示、置顶、安全设置、真实磁盘文件接收、粒子流程、指定气泡与格式、错误/取消/成功反馈。');
    console.log('实际能力：' + JSON.stringify(capabilities));
    console.log('截图已保存到 artifacts/。系统保存对话框在本测试中被替代，原生 Finder 拖拽和保存对话框需单独验证。');
  } finally {
    await electron.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
