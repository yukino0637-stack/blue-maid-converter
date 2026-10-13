// Real offline conversion tests; generated fixtures and reports are kept in ignored artifacts/.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const sharp = require('sharp');
const ExcelJS = require('exceljs');
const { fs, path, command, zipFiles, zipEntries } = require('../src/conversion-utils.cjs');
const { inspectInput, convertFile, convertFiles, detectLibreOffice, wordXml } = require('../src/converter.cjs');
const { detectExtraTools, probeMedia } = require('../src/formats.cjs');
const { extension, routes, describe } = require('../src/conversion-full.cjs');
const hash = async p => createHash('sha256').update(await fs.readFile(p)).digest('hex');
(async () => {
  const root = path.resolve('artifacts/full-format-tests');
  await fs.mkdir(root, { recursive: true });
  const inputs = path.join(root, 'inputs'), outputs = path.join(root, 'outputs');
  await fs.rm(inputs, { recursive: true, force: true }); await fs.mkdir(inputs, { recursive: true }); await fs.rm(outputs, { recursive: true, force: true }); await fs.mkdir(outputs);
  const tools = { ...await detectLibreOffice(), ...await detectExtraTools() };
  assert.ok(tools.available && tools.pdfSupported && tools.ffmpeg && tools.poppler && tools.pandoc && tools.ocr && tools.qpdf && tools.jxl && tools.raw && tools.ofdFont);
  const records = []; let number = 0;
  const sourceFile = name => path.join(inputs, name);
  const fixture = async (name, bytes) => { const file = sourceFile(name); await fs.writeFile(file, bytes); return file; };
  const sampleImage = sourceFile('image.png');
  await sharp({ create: { width: 128, height: 96, channels: 4, background: { r: 20, g: 100, b: 220, alpha: .6 } } }).png().toFile(sampleImage);
  const md = await fixture('document.md', '# 中文标题\n\n已知文字 CONVERSION_CHECK。\n\n| 名称 | 值 |\n|---|---|\n| 小鲸 | 123 |\n\n```js\nconst value = 42;\n```\n\n公式 $x^2+1$\n\n![测试图片](image.png)\n');
  const docx = sourceFile('document.docx');
  await command(tools.pandocPath, [md, '-o', docx, '--resource-path', inputs]);
  const html = await fixture('document.html', '<!doctype html><meta charset="utf-8"><h1>中文标题</h1><p>CONVERSION_CHECK 已知文字</p><table><tr><td>名称</td><td>值</td></tr><tr><td>小鲸</td><td>123</td></tr></table>');
  await fixture('plain.txt', 'CONVERSION_CHECK 中文文本\n第二行');
  await fixture('data.json', JSON.stringify([{ name: '小鲸', value: 123, note: '逗号,引号"\n换行' }]));
  await fixture('data.yaml', 'name: 小鲸\nvalue: 123\n');
  await fixture('data.xml', '<root><name>小鲸</name><value>123</value></root>');
  await fixture('table.csv', '\ufeff姓名,值\r\n小鲸,123\r\n');
  await fixture('captions.srt', '1\n00:00:00,500 --> 00:00:01,500\n你好 CONVERSION_CHECK\n\n2\n00:00:02,000 --> 00:00:03,000\n第二句\n');
  const book = new ExcelJS.Workbook(); book.addWorksheet('数据').addRows([['姓名', '值'], ['小鲸', 123]]); await book.xlsx.writeFile(sourceFile('table.xlsx'));
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 2; i++) {
    const page = pdf.addPage([600, 800]);
    page.drawText('CONVERSION_CHECK PAGE ' + i, { x: 50, y: 730, size: 22, font });
    for (const [y, left, right] of [[650, 'Name', 'Value'], [620, 'Whale', '123']]) { page.drawText(left, { x: 50, y, size: 14, font }); page.drawText(right, { x: 250, y, size: 14, font }); }
  }
  const pdfFile = await fixture('pages.pdf', await pdf.save());
  const scanNative = await PDFDocument.create(); scanNative.registerFontkit(require('@pdf-lib/fontkit'));
  const chinese = await scanNative.embedFont(await fs.readFile(path.resolve('assets/conversion-fonts/NotoSansCJKsc-Regular.otf')), { subset: false });
  const scanPage = scanNative.addPage([800, 500]);
  scanPage.drawText('扫描中文文字 小鲸 文件转换 测试内容', { x: 40, y: 400, font: chinese, size: 30 });
  const scanEnglish = await scanNative.embedFont(StandardFonts.Helvetica);
  scanPage.drawText('OCR_CHECK 123456 ABCDEFG', { x: 40, y: 330, font: scanEnglish, size: 28 });
  await fixture('scan-native.pdf', await scanNative.save());
  await command(tools.pdftoppmPath, ['-singlefile', '-png', '-r', '160', sourceFile('scan-native.pdf'), sourceFile('scan')]);
  const scanPdf = await PDFDocument.create(), scanPng = await scanPdf.embedPng(await fs.readFile(sourceFile('scan.png')));
  scanPdf.addPage([800, 500]).drawImage(scanPng, { x: 0, y: 0, width: 800, height: 500 }); await fixture('scan.pdf', await scanPdf.save());
  const psd = Buffer.alloc(26 + 12 + 2 + 128 * 96 * 3);
  psd.write('8BPS'); psd.writeUInt16BE(1, 4); psd.writeUInt16BE(3, 12); psd.writeUInt32BE(96, 14); psd.writeUInt32BE(128, 18); psd.writeUInt16BE(8, 22); psd.writeUInt16BE(3, 24); psd.fill(100, 40); await fixture('design.psd', psd);
  await fixture('drawing.ai', await pdf.save()); // AI's explicitly supported PDF-compatible subset.
  await fixture('drawing.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="96"><rect width="128" height="96" fill="blue"/></svg>');
  await zipFiles([{ name: 'OFD.xml', bytes: Buffer.from('<ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016"><ofd:DocBody><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>') },
    { name: 'Doc_0/Document.xml', bytes: Buffer.from('<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016"><ofd:CommonData><ofd:PageArea><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:PageArea><ofd:PublicRes>PublicRes.xml</ofd:PublicRes></ofd:CommonData><ofd:Pages><ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/></ofd:Pages></ofd:Document>') },
    { name: 'Doc_0/PublicRes.xml', bytes: Buffer.from('<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016"><ofd:Fonts><ofd:Font ID="2" FontName="NotoSansSC"/></ofd:Fonts></ofd:Res>') },
    { name: 'Doc_0/Pages/Page_0/Content.xml', bytes: Buffer.from('<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016"><ofd:Content><ofd:Layer ID="3"><ofd:TextObject ID="4" Boundary="20 20 160 20" Font="2" Size="5"><ofd:TextCode X="0" Y="5">中文小鲸 OFD_CHECK</ofd:TextCode></ofd:TextObject></ofd:Layer></ofd:Content></ofd:Page>') }], sourceFile('invoice.ofd'));
  async function convert(input, target, params = {}, inspectOutput) {
    let source = describe(path.extname(input));
    try {
      source = await inspectInput(input);
      const before = await hash(input), ext = extension(source, target, params);
      const output = path.join(outputs, String(++number).padStart(4, '0') + '-' + source.ext + '.' + ext);
      const result = await convertFile(input, output, tools.executable, { target, params, tools, details: true });
      assert.equal(await hash(input), before, '原文件哈希不变'); assert.ok((await fs.stat(output)).size > 0);
      if (inspectOutput) await inspectOutput(result);
      records.push({ input: source.ext, target, params: Object.keys(params).filter(k => k !== 'password'), status: 'pass', warnings: result.warnings });
      console.log('PASS ' + source.ext + ' → ' + target + (params.pdfMode ? ' (' + params.pdfMode + ')' : ''));
      return result;
    } catch (error) {
      records.push({ input: source.ext, target, status: 'fail', error: error.message }); console.log('FAIL ' + source.ext + ' → ' + target + ': ' + error.message); return null;
    } finally { await fs.writeFile(path.join(root, 'report.json'), JSON.stringify({ referenceCommit: require('../src/conversion-routes.json').referenceCommit, records }, null, 2)); }
  }
  const wordMd = await convert(docx, 'md', {}, async result => {
    const text = await fs.readFile(result.path, 'utf8'); assert.match(text, /# 中文标题/); assert.match(text.replaceAll('\\_', '_'), /CONVERSION_CHECK/); assert.match(text, /小鲸.*123/); assert.match(text, /const value = 42/);
    assert.ok(result.attachments); const names = await fs.readdir(result.attachments); assert.equal(names.length, 1); assert.ok(text.includes(encodeURIComponent(path.basename(result.path) + '.assets') + '/' + names[0]));
  });
  await convert(pdfFile, 'md', {}, async result => { const text = await fs.readFile(result.path, 'utf8'); assert.match(text, /PAGE 1/); assert.match(text, /PAGE 2/); });
  await convert(sourceFile('scan.pdf'), 'md', {}, async result => { const text = await fs.readFile(result.path, 'utf8'); assert.match(text, /OCR_CHECK/); assert.match(text.replace(/\s/g, ''), /扫描中文文字/); });
  await convert(sourceFile('scan.png'), 'docx', {}, async result => assert.match(await wordXml(result.path), /OCR_CHECK/));
  await convert(pdfFile, 'xlsx', {}, async result => { const book = new ExcelJS.Workbook(); await book.xlsx.readFile(result.path); assert.equal(book.worksheets.length, 2); assert.equal(book.worksheets[0].getCell('B3').value, '123'); });
  await convert(md, 'docx', {}, async result => { const text = await wordXml(result.path); assert.match(text, /中文标题/); assert.match(text, /m:oMath/); assert.match(text, /w:drawing/); });
  await convert(sourceFile('invoice.ofd'), 'pdf', {}, async result => {
    const extracted = await require('../src/conversion-pdf.cjs').extractPages(result.path, { dir: outputs }, tools);
    assert.match(extracted.pages[0].text.replace(/\s/g, ''), /中文小鲸OFD_CHECK/);
  });
  const focused = [[docx, 'html'], [docx, 'txt'], [md, 'pdf'], [pdfFile, 'txt'], [pdfFile, 'html'], [pdfFile, 'png'], [pdfFile, 'jpg'], [pdfFile, 'webp'],
    [sourceFile('data.yaml'), 'json'], [sourceFile('data.xml'), 'json'], [sourceFile('data.json'), 'csv'], [sourceFile('captions.srt'), 'vtt'], [sourceFile('captions.srt'), 'ass'], [sourceFile('captions.srt'), 'ssa'], [sourceFile('captions.srt'), 'txt']];
  for (const [input, target] of focused) await convert(input, target);
  for (const target of routes.get('png').targets.filter(t => !['txt', 'md', 'docx'].includes(t))) {
    const result = await convert(sampleImage, target);
    if (result && target !== 'pdf' && !['mp4', 'webm'].includes(target)) await fs.copyFile(result.path, sourceFile('image.' + target));
  }
  const epub = await convert(md, 'epub', {}, async result => {
    const entries = await zipEntries(result.path); assert.equal(entries.get('mimetype').toString(), 'application/epub+zip'); assert.ok(entries.has('OEBPS/book.opf'));
  });
  if (epub) { await fs.copyFile(epub.path, sourceFile('book.epub')); for (const target of ['txt', 'md', 'html', 'pdf', 'docx']) await convert(sourceFile('book.epub'), target); }
  await convert(pdfFile, 'pdf', { pdfMode: 'split' }, async result => assert.equal((await zipEntries(result.path)).size, 2));
  await convert(pdfFile, 'pdf', { pdfMode: 'group', groupPages: 2 }, async result => assert.equal((await zipEntries(result.path)).size, 1));
  const secured = await convert(pdfFile, 'pdf', { pdfMode: 'encrypt', password: '测试口令 spaces !' });
  if (secured) {
    await fs.copyFile(secured.path, sourceFile('encrypted.pdf'));
    await convert(sourceFile('encrypted.pdf'), 'pdf', { pdfMode: 'decrypt', password: '测试口令 spaces !' }, async result => assert.equal((await PDFDocument.load(await fs.readFile(result.path))).getPageCount(), 2));
    await assert.rejects(convertFile(sourceFile('encrypted.pdf'), path.join(outputs, 'wrong-password.pdf'), tools.executable, { target: 'pdf', tools, params: { pdfMode: 'decrypt', password: 'wrong' } }));
  }
  await zipFiles([{ name: '10.png', path: sampleImage }, { name: '2.png', path: sampleImage }], sourceFile('pictures.zip')); await convert(sourceFile('pictures.zip'), 'pdf');
  for (const [files, mode, name] of [[[sampleImage, sourceFile('image.jpg')], 'merge', 'merged-images.pdf'], [[pdfFile, pdfFile], 'merge', 'merged-pdfs.pdf'], [[docx, docx], 'batch', 'batch-markdown.zip']]) {
    const result = await convertFiles(files, path.join(outputs, name), tools.executable, { target: mode === 'merge' ? 'pdf' : 'md', tools, params: { combineMode: mode } });
    if (mode === 'merge') assert.equal((await PDFDocument.load(await fs.readFile(result.path))).getPageCount(), name.includes('images') ? 2 : 4);
    else { const entries = await zipEntries(result.path); assert.equal([...entries.keys()].filter(name => name.endsWith('.md')).length, 2); assert.equal([...entries.keys()].filter(name => name.endsWith('.png')).length, 2); }
    console.log('PASS ' + name);
  }
  if (process.env.FULL_MATRIX === '1') {
    for (const [input, source, formats] of [[docx, { category: 'document' }, ['odt', 'rtf']], [sourceFile('table.xlsx'), { category: 'spreadsheet' }, ['ods']],
      [path.resolve('artifacts/format-expansion/inputs/slides.pptx'), { category: 'presentation' }, ['odp']]]) {
      const workspace = { dir: path.join(root, 'fixture-office'), profile: path.join(root, 'fixture-office-profile') };
      await fs.mkdir(workspace.dir, { recursive: true });
      for (const target of formats) {
        const result = await require('../src/conversion-documents.cjs').office(input, target, workspace, source, tools);
        await fs.copyFile(result.output, sourceFile('fixture.' + target));
      }
    }
    for (const target of ['vtt', 'ass', 'ssa']) {
      const result = await convert(sourceFile('captions.srt'), target); if (result) await fs.copyFile(result.path, sourceFile('captions.' + target));
    }
    const wav = path.resolve('artifacts/format-expansion/inputs/audio.wav');
    for (const target of ['ogg', 'opus', 'wma']) {
      const result = await convert(wav, target); if (result) await fs.copyFile(result.path, sourceFile('audio.' + target));
    }
    const video = path.resolve('artifacts/format-expansion/inputs/video.mp4');
    for (const [ext, args] of [['avi', ['-c:v', 'mpeg4', '-c:a', 'mp3']], ['m4v', ['-c:v', 'libx264', '-c:a', 'aac', '-f', 'mp4']],
      ['m4s', ['-c:v', 'libx264', '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4']],
      ['wmv', ['-c:v', 'wmv2', '-c:a', 'wmav2']], ['flv', ['-c:v', 'flv', '-c:a', 'mp3']]]) {
      await command(tools.ffmpegPath, ['-v', 'error', '-i', video, ...args, sourceFile('video.' + ext)]);
    }
    for (const encoding of ['h265', 'av1']) await convert(video, 'mkv', { encoding }, async result => {
      const info = await probeMedia(result.path, tools);
      assert.equal(info.streams.find(stream => stream.codec_type === 'video').codec_name, encoding === 'h265' ? 'hevc' : 'av1');
    });

    await require('./make-special-fixtures.cjs')(inputs, tools.executable);
    const available = new Map();
    for (const name of await fs.readdir(inputs)) { const ext = path.extname(name).slice(1); if (routes.has(ext) && !available.has(ext) && !['encrypted.pdf', 'scan-native.pdf'].includes(name)) available.set(ext, sourceFile(name)); }
    const legacy = path.resolve('artifacts/format-expansion/inputs');
    for (const name of await fs.readdir(legacy)) { const ext = path.extname(name).slice(1); if (routes.has(ext) && !available.has(ext) && !name.startsWith('bad') && !name.startsWith('silent')) available.set(ext, path.join(legacy, name)); }
    const aliases = { jpeg: 'jpg', jfif: 'jpg', jpe: 'jpg', tif: 'tiff', htm: 'html', markdown: 'md', log: 'txt', yml: 'yaml', j2k: 'jp2' };
    for (const [alias, original] of Object.entries(aliases)) if (available.has(original)) {
      // JP2 container is not a raw J2K codestream; generate it with the actual codec.
      const output = sourceFile('alias.' + alias);
      if (alias === 'j2k') await command(tools.ffmpegPath, ['-v', 'error', '-i', sampleImage, '-c:v', 'jpeg2000', '-format', 'j2k', '-f', 'image2', output]);
      else await fs.copyFile(available.get(original), output);
      available.set(alias, output);
    }
    for (const [ext, input] of available) {
      let ocrImage = input;
      if (routes.get(ext).category === 'image' && !['ai', 'psd', 'svg', 'heic', 'heif', 'jfif', 'jpe', 'jpeg', 'tif', 'j2k'].includes(ext)) {
        if (ext === 'png') ocrImage = sourceFile('scan.png');
        else {
          const result = await convert(sourceFile('scan.png'), ext);
          if (result) ocrImage = result.path;
        }
      }
      for (const target of routes.get(ext).targets) {
        const selected = ['txt', 'md', 'docx'].includes(target) && routes.get(ext).category === 'image' ? ocrImage : input;
        if (selected === input && routes.get(ext).category === 'image' && ['txt', 'md', 'docx'].includes(target)) {
          records.push({ input: ext, target, status: 'untested', reason: '样例无文字；OCR 需要含已知文字的有效样例。' }); continue;
        }
        await convert(selected, target);
      }
    }
    await fs.writeFile(path.join(root, 'missing-fixtures.json'), JSON.stringify([...routes.keys()].filter(ext => !available.has(ext)), null, 2));
  }
  const failures = records.filter(row => row.status === 'fail');
  console.log(JSON.stringify({ pass: records.filter(row => row.status === 'pass').length, fail: failures.length, untested: records.filter(row => row.status === 'untested').length }));
  if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
