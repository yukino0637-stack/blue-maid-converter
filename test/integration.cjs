const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { detectLibreOffice, convertFile, wordXml } = require('../src/converter.cjs');
if (process.argv[2]) process.env.SOFFICE_PATH = process.argv[2];

(async () => {
  const tool = await detectLibreOffice();
  if (!tool.available) throw new Error('请先执行 brew install --cask libreoffice，再运行真实转换检查。');
  console.log('实际转换工具：' + tool.version);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cat-converter-integration-'));
  try {
    const run = promisify(execFile);
    const html = path.join(dir, 'sample.html');
    const docx = path.join(dir, 'sample.docx');
    const pdf = path.join(dir, 'converted.pdf');
    const reverse = path.join(dir, 'reverse.docx');
    await fs.writeFile(html, '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>CAT CONVERTER MVP</h1><p>中文转换样例：小猫接文件喵。</p><p>A readable paragraph for a round trip.</p><table border="1"><tr><td>Word</td><td>PDF</td></tr></table></body></html>');
    await run(tool.executable, [
      '-env:UserInstallation=' + pathToFileURL(path.join(dir, 'profile')).href,
      '--headless', '--convert-to', 'docx:Office Open XML Text', '--outdir', dir, html,
    ], { timeout: 120_000, killSignal: 'SIGKILL' });
    assert.ok((await wordXml(docx)).includes('CAT CONVERTER MVP'));
    const original = await fs.readFile(docx);
    await convertFile(docx, pdf, tool.executable);
    assert.deepEqual(await fs.readFile(docx), original);
    console.log('PASS Word→PDF：有效 PDF 已生成，原文件字节不变。');
    const artifacts = path.resolve('artifacts');
    await fs.mkdir(artifacts, { recursive: true });
    await fs.copyFile(docx, path.join(artifacts, 'sample.docx'));
    await fs.copyFile(pdf, path.join(artifacts, 'sample.pdf'));
    if (!tool.pdfSupported) throw new Error('PDF→Word 能力检测未通过，不能算双向转换成功。');
    const originalPdf = await fs.readFile(pdf);
    await convertFile(pdf, reverse, tool.executable);
    await fs.copyFile(reverse, path.join(artifacts, 'roundtrip.docx'));
    const xml = await wordXml(reverse);
    assert.ok(xml.replace(/<[^>]+>/g, '').includes('CAT CONVERTER MVP'), '反向转换需保留真实文字');
    assert.ok(xml.replace(/<[^>]+>/g, '').includes('中文转换样例：小猫接文件喵。'), '反向转换需保留样例中文');
    assert.deepEqual(await fs.readFile(pdf), originalPdf);
    console.log('PASS PDF→Word：已生成有效 DOCX，样例文字保留，原 PDF 字节不变。');
    console.log('转换样例已保存到 artifacts/，可手动查看排版。');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
