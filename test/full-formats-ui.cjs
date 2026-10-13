const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-full-ui-'));
  const inputs = path.resolve(process.env.TEST_INPUTS_DIR || 'artifacts/full-format-tests/inputs');
  const electron = await _electron.launch({ executablePath: process.env.TEST_APP_EXE || require('electron'), args: [...(process.env.TEST_APP_EXE ? [] : ['.']), '--user-data-dir=' + path.join(dir, 'profile')], cwd: process.cwd(), env: { ...process.env } });
  try {
    const page = await electron.firstWindow(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => typeof state !== 'undefined' && state !== 'checking', undefined, { timeout: 150_000 });
    async function drop(names) {
      await page.evaluate(() => { document.getElementById('full-files')?.remove(); const input = document.createElement('input'); input.id = 'full-files'; input.type = 'file'; input.multiple = true; input.hidden = true; document.body.append(input); });
      await page.locator('#full-files').setInputFiles(names.map(name => path.join(inputs, name)));
      await page.evaluate(() => { const transfer = new DataTransfer(); for (const file of document.getElementById('full-files').files) transfer.items.add(file); petArea.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })); });
      await page.waitForFunction(() => state === 'choosing', undefined, { timeout: 150_000 });
    }
    async function save(name) { await electron.evaluate(({ dialog }, destination) => { dialog.showSaveDialog = async (_, options) => { globalThis.conversionSave = options; return destination ? { canceled: false, filePath: destination } : { canceled: true }; }; }, name ? path.join(dir, name) : null); }
    async function success() {
      await page.waitForFunction(() => state === 'success', undefined, { timeout: 150_000 });
      assert.equal(await page.evaluate(() => videos.finish.loop), false);
      await page.evaluate(() => { videos.finish.currentTime = videos.finish.duration - .1; });
      await page.waitForFunction(() => animation === 'idle');
    }
    await drop(['document.docx']); await save('word.md'); await page.locator('[data-target="md"]').click(); await success();
    assert.ok((await fs.readdir(path.join(dir, 'word.md.assets'))).length);
    await drop(['pages.pdf']); await page.locator('[data-target="xlsx"]').click();
    await page.locator('select[name=tableMode]').selectOption('position'); await save('table.xlsx');
    await page.locator('button[type=submit]').click(); await success();
    assert.deepEqual(await electron.evaluate(() => conversionSave.filters[0].extensions), ['xlsx']);
    await drop(['pages.pdf']); await page.locator('[data-target="pdf"]').click();
    assert.equal(await page.locator('#formats form').count(), 1);
    await page.locator('select[name=pdfMode]').selectOption('group'); await page.locator('input[name=groupPages]').fill('2'); await save('split.zip');
    await page.locator('button[type=submit]').click(); await success();
    assert.deepEqual(await electron.evaluate(() => conversionSave.filters[0].extensions), ['zip']);
    await drop(['pages.pdf']); await page.locator('[data-target="pdf"]').click();
    await page.locator('select[name=pdfMode]').selectOption('encrypt'); await page.locator('input[name=password]').fill('UI test password'); await save('encrypted.pdf');
    await page.locator('button[type=submit]').click(); await success(); assert.deepEqual(await electron.evaluate(() => conversionSave.filters[0].extensions), ['pdf']);
    await drop(['document.docx', 'document.docx']); await save('batch.zip'); await page.locator('[data-target="md"]').click(); await success();
    assert.deepEqual(await electron.evaluate(() => conversionSave.filters[0].extensions), ['zip']);
    await drop(['image.png', 'image.jpg']); await page.locator('[data-target="pdf"]').click();
    await page.locator('select[name=combineMode]').selectOption('merge'); await save('images.pdf'); await page.locator('button[type=submit]').click(); await success();
    await drop(['pages.pdf']); await page.locator('[data-target="pdf"]').click(); await save(null); await page.locator('button[type=submit]').click();
    await page.waitForFunction(() => state === 'choosing' && document.getElementById('message').textContent.includes('取消'));
    assert.equal(await page.locator('[data-target="md"]').count(), 1); assert.equal(await page.evaluate(() => animation), 'idle');
    assert.deepEqual(errors, []);
    console.log('PASS Word→MD 附件、PDF 参数及保存扩展名、批量转换、图片合并、取消回格式列表、成功后回待机。系统保存窗口和 Finder drop 由测试替代。');
  } finally { await electron.close(); await fs.rm(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
