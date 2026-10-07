const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-formats-ui-'));
  const inputs = path.resolve('artifacts/format-expansion/inputs');
  const artifacts = path.resolve('artifacts/format-expansion');
  const electron = await _electron.launch({ executablePath: require('electron'), args: ['.', '--user-data-dir=' + path.join(dir, 'profile')], cwd: process.cwd(), env: { ...process.env }, timeout: 60_000 });
  try {
    const page = await electron.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => state !== 'checking', undefined, { timeout: 150_000 });
    assert.ok(await page.evaluate(() => tool.available && tool.ffmpeg && tool.poppler));
    await page.evaluate(() => {
      window.conversionAnimations = { working: 0, ended: 0 };
      videos.working.addEventListener('play', () => window.conversionAnimations.working++);
      videos.finish.addEventListener('ended', () => window.conversionAnimations.ended++);
    });
    async function drop(input) {
      await page.evaluate(() => {
        document.getElementById('test-file')?.remove();
        const input = document.createElement('input'); input.type = 'file'; input.id = 'test-file'; input.hidden = true; document.body.append(input);
      });
      await page.locator('#test-file').setInputFiles(input);
      await page.evaluate(() => {
        const transfer = new DataTransfer(); transfer.items.add(document.getElementById('test-file').files[0]);
        petArea.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
      });
      await page.waitForFunction(() => state === 'choosing', undefined, { timeout: 150_000 });
    }
    async function saveTo(filePath) {
      await electron.evaluate(({ dialog }, destination) => { dialog.showSaveDialog = async (_, options) => {
        globalThis.lastFormatDialog = options; return destination ? { canceled: false, filePath: destination } : { canceled: true };
      }; }, filePath);
    }
    await drop(path.join(inputs, 'image.png'));
    assert.deepEqual(await page.locator('#formats button').evaluateAll(buttons => buttons.map(button => button.dataset.target)), ['jpg', 'webp']);
    assert.equal(await page.evaluate(() => window.cat.convert('sh').then(() => 'bad', error => error.message)), '不支持这个转换目标鲸。');
    await saveTo(null);
    await page.locator('[data-target="webp"]').click();
    await page.waitForFunction(() => state === 'choosing' && document.getElementById('message').textContent.includes('取消'));
    assert.equal(await page.evaluate(() => animation), 'idle');
    await page.screenshot({ path: path.join(artifacts, 'multi-format-card.png'), omitBackground: true });
    const damaged = path.join(dir, 'damaged.png');
    await fs.copyFile(path.join(inputs, 'image.png'), damaged);
    await drop(damaged);
    await fs.writeFile(damaged, 'not an image anymore');
    const failedOutput = path.join(dir, 'failure.webp');
    await saveTo(failedOutput);
    await page.locator('[data-target="webp"]').click();
    await page.waitForFunction(() => state === 'choosing' && document.getElementById('message').textContent.includes('图片无效'));
    assert.equal(await page.evaluate(() => animation), 'idle');
    await assert.rejects(fs.access(failedOutput));
    await page.screenshot({ path: path.join(artifacts, 'new-format-failure.png'), omitBackground: true });
    const cases = [['image.png', 'webp', 'webp', 2], ['audio.wav', 'mp3', 'mp3', 4], ['video.mov', 'mp4', 'mp4', 4],
      ['table.csv', 'xlsx', 'xlsx', 2], ['slides.pptx', 'png', 'zip', 3], ['notes.md', 'txt', 'txt', 1]];
    for (const [input, target, extension, count] of cases) {
      await drop(path.join(inputs, input));
      assert.equal(await page.locator('#formats button').count(), count);
      assert.equal(await page.locator('#bubble-title').textContent(), '要转换为什么格式鲸');
      await page.waitForFunction(() => !bubble.getAnimations().some(animation => animation.playState === 'running'));
      const layout = await page.locator('#bubble').evaluate(element => {
        const rect = element.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, right: rect.right };
      });
      assert.ok(layout.top >= 0 && layout.bottom <= 216 && layout.right <= 360, JSON.stringify(layout));
      if (input === 'audio.wav') await page.screenshot({ path: path.join(artifacts, 'audio-format-card.png'), omitBackground: true });
      const destination = path.join(dir, input.replace('.', '-') + '.' + extension);
      await saveTo(destination);
      await page.locator(`[data-target="${target}"]`).click();
      await page.waitForFunction(() => state === 'success', undefined, { timeout: 150_000 });
      assert.ok((await fs.stat(destination)).size > 0);
      const save = await electron.evaluate(() => lastFormatDialog);
      assert.equal(path.extname(save.defaultPath), '.' + extension);
      assert.deepEqual(save.filters[0].extensions, [extension]);
      assert.equal(await page.evaluate(() => videos.finish.loop), false);
      const ended = await page.evaluate(() => window.conversionAnimations.ended);
      // 跳到尾部缩短等待，仍由视频真实 ended 事件触发回待机。
      await page.evaluate(() => { videos.finish.currentTime = videos.finish.duration - .15; });
      await page.waitForFunction(value => animation === 'idle' && window.conversionAnimations.ended > value, ended);
      console.log('PASS 多目标气泡/真实转换/保存扩展名/结束回待机：' + input);
    }
    assert.ok(await page.evaluate(() => window.conversionAnimations.working >= 6));
    assert.deepEqual(errors, []);
    console.log('PASS 六类界面流程、非默认目标选择、伪造目标拒绝、取消及文件变化失败中文提示。系统保存对话框和 Finder drop 由测试替代。');
  } finally {
    await electron.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
