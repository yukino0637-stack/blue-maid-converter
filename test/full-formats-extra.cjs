const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const { fs, path, command, zipEntries } = require('../src/conversion-utils.cjs');
const { convertFile, inspectInput, detectLibreOffice, wordXml } = require('../src/converter.cjs');
const { detectExtraTools, probeMedia } = require('../src/formats.cjs');
const { extension, routes } = require('../src/conversion-full.cjs');
(async () => {
  const tools = { ...await detectLibreOffice(), ...await detectExtraTools() };
  const root = path.resolve('artifacts/full-format-tests'), dir = path.join(root, 'extra');
  await fs.rm(dir, { recursive: true, force: true }); await fs.mkdir(dir);
  const inputs = path.join(root, 'inputs'), records = [];
  await require('./make-special-fixtures.cjs')(inputs, tools.executable);
  async function convert(input, target, params = {}, check) {
    const source = await inspectInput(input), output = path.join(dir, records.length + '-' + source.ext + '.' + extension(source, target, params));
    const result = await convertFile(input, output, tools.executable, { target, params, tools, details: true });
    if (check) await check(result);
    records.push({ input: source.ext, target, status: 'pass', parameters: Object.keys(params) });
    console.log('PASS ' + source.ext + ' → ' + target); return result;
  }
  for (const ext of ['doc', 'xlsm', 'mobi']) for (const target of routes.get(ext).targets) {
    const input = path.join(inputs, ext === 'doc' ? 'document.doc' : ext === 'xlsm' ? 'table.xlsm' : 'book.mobi');
    await convert(input, target, {}, async result => {
      if (ext === 'mobi') { const bytes = target === 'epub' ? [...(await zipEntries(result.path)).values()].map(b => b.toString()).join('') : await fs.readFile(result.path, 'utf8'); assert.match(bytes.replaceAll('\\_', '_'), /MOBI_CHECK/); assert.match(bytes.replaceAll('\\_', '_'), /CHAPTER_TWO/); }
    });
  }
  const md = await convert(path.join(inputs, 'document.docx'), 'md', {}, async result => {
    const text = await fs.readFile(result.path, 'utf8'); assert.match(text, /\$x\^\{2\} \+ 1\$/); assert.match(text, /(?:\n {4}|```).*const value = 42/);
  });
  await convert(md.path, 'docx', {}, async result => { const xml = await wordXml(result.path); assert.match(xml, /m:oMath/); assert.match(xml, /w:drawing/); });
  const plain = path.join(dir, 'gb18030.txt'); await fs.writeFile(plain, Buffer.from([0xd6, 0xd0, 0xce, 0xc4]));
  await convert(plain, 'md', {}, async result => assert.equal(await fs.readFile(result.path, 'utf8'), '中文'));
  const gbCsv = path.join(dir, 'gb18030.csv'); await fs.writeFile(gbCsv, Buffer.concat([Buffer.from([0xd6, 0xd0, 0xce, 0xc4]), Buffer.from(',123\n')]));
  await convert(gbCsv, 'xlsx', {}, async result => { const book = new (require('exceljs').Workbook)(); await book.xlsx.readFile(result.path); assert.equal(book.worksheets[0].getCell('A1').value, '中文'); assert.equal(String(book.worksheets[0].getCell('B1').value), '123'); });
  const animated = path.join(dir, 'animated.gif');
  await command(tools.ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=128x96:rate=10:duration=2', animated]);
  for (const target of ['mp4', 'webm']) await convert(animated, target, {}, async result => {
    const info = await probeMedia(result.path, tools); assert.ok(Math.abs(Number(info.format.duration) - 2) < .2);
    assert.ok(Number(info.streams[0].duration || info.format.duration) > 1.8);
    const first = path.join(dir, target + '-first.png'), last = path.join(dir, target + '-last.png');
    await command(tools.ffmpegPath, ['-v', 'error', '-i', result.path, '-frames:v', '1', first]);
    await command(tools.ffmpegPath, ['-v', 'error', '-ss', '1.5', '-i', result.path, '-frames:v', '1', last]);
    const a = await sharp(first).raw().toBuffer(), b = await sharp(last).raw().toBuffer(); assert.ok(!a.equals(b), '视频必须有变化的动画帧');
  });
  const onePage = await PDFDocument.create(); const original = await PDFDocument.load(await fs.readFile(path.join(inputs, 'pages.pdf')));
  onePage.addPage((await onePage.copyPages(original, [0]))[0]); const single = path.join(dir, 'single.pdf'); await fs.writeFile(single, await onePage.save());
  await convert(single, 'png', {}, async result => assert.equal((await sharp(result.path).metadata()).format, 'png'));
  await assert.rejects(convertFile(single, path.join(dir, 'invalid.zip'), tools.executable, { target: 'pdf', tools, params: { pdfMode: 'group', groupPages: -1 } }), /整数/);
  const drm = Buffer.from(await fs.readFile(path.join(inputs, 'book.mobi'))); drm.writeUInt16BE(1, drm.readUInt32BE(78) + 12); const protectedBook = path.join(dir, 'protected.mobi'); await fs.writeFile(protectedBook, drm);
  await assert.rejects(inspectInput(protectedBook), /DRM/);
  await fs.writeFile(path.join(root, 'extra-report.json'), JSON.stringify(records, null, 2));
  console.log('PASS all extra content checks: ' + records.length);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
