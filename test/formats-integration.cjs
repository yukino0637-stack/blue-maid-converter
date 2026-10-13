const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const ExcelJS = require('exceljs');
const { detectLibreOffice, inspectInput, convertFile } = require('../src/converter.cjs');
const { detectExtraTools, probeMedia, readText, parseTable } = require('../src/formats.cjs');
const run = promisify(execFile);
const root = path.resolve('artifacts/format-expansion');
const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');

(async () => {
  await fs.mkdir(root, { recursive: true });
  const [office, media] = await Promise.all([detectLibreOffice(), detectExtraTools()]);
  const tools = { ...office, ...media };
  assert.ok(tools.available && tools.pdfSupported && tools.ffmpeg && tools.poppler,
    '实际工具必须可用，不能跳过转换: ' + JSON.stringify({ libreoffice: tools.available, pdfImport: tools.pdfSupported, ffmpeg: tools.ffmpeg, poppler: tools.poppler }));
  const inputs = path.join(root, 'inputs');
  const outputs = path.join(root, 'outputs');
  // 只清理这项测试自己的旧结果，保证不碰用户文件。
  await fs.rm(outputs, { recursive: true, force: true });
  await fs.mkdir(inputs, { recursive: true });
  await fs.mkdir(outputs);
  const file = name => path.join(inputs, name);
  await sharp({ create: { width: 32, height: 24, channels: 4, background: { r: 40, g: 160, b: 230, alpha: .5 } } }).png().toFile(file('image.png'));
  await sharp(file('image.png')).flatten({ background: '#ffffff' }).jpeg().toFile(file('image.jpg'));
  await sharp(file('image.png')).webp().toFile(file('image.webp'));
  await sharp(file('image.png')).flatten({ background: '#ffffff' }).withMetadata({ orientation: 6 }).jpeg().toFile(file('rotated.jpg'));
  // Fixed self-generated 32x24 colour HEIC: both platforms decode the same real container.
  await fs.writeFile(file('photo.heic'), Buffer.from('AAAAKGZ0eXBoZWljAAAAAG1pZjFNaUhFTWlQcm1pYWZNaUhCaGVpYwAAArJtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAA5waXRtAAAAAAABAAAATWlpbmYAAAAAAAMAAAAVaW5mZQIAAAAAAQAAaHZjMQAAAAAVaW5mZQIAAAEAAgAAaHZjMQAAAAAVaW5mZQIAAAEAAwAARXhpZgAAAAAoaXJlZgAAAAAAAAAOYXV4bAACAAEAAQAAAA5jZHNjAAMAAQABAAABpGlwcnAAAAF7aXBjbwAAABNjb2xybmNseAACAAIABoAAAAAMY2xsaQDLAEAAAAAUaXNwZQAAAAAAAAAgAAAAGAAAAAlpcm90AAAAABBwaXhpAAAAAAMICAgAAAAOcGl4aQAAAAABCAAAADdhdXhDAAAAAHVybjptcGVnOmhldmM6MjAxNTphdXhpZDoxAAAAAAwAAAAITgGlBAAB/kAAAABxaHZjQwEDcAAAALAAAAAAAB7wAPz9+PgAAAsDoAABABdAAQwB//8DcAAAAwCwAAADAAADAB5wJKEAAQAjQgEBA3AAAAMAsAAAAwAAAwAeoBQgQcCDCuIe5FlU3AgIGAKiAAEACUQBwGFyyEBTJAAAAHFodmNDAQQIAAAAv8gAAAAAHvAA/Pz4+AAACwOgAAEAF0ABDAH//wQIAAADAL/IAAADAAAeFwJAoQABACNCAQEECAAAAwC/yAAAAwAAHsBQgQcBAwU4gXuRZVNwICAgCKIAAQAJRAHAYdLIQFMkAAAAIWlwbWEAAAAAAAAAAgABBoECAwWIhAACBQMGh4mEAAAAOmlsb2MAAAAARAAAAwABAAAAAQAAAzYAAABIAAIAAAABAAADfgAAABQAAwAAAAEAAALqAAAATAAAAAFtZGF0AAAAAAAAALgAAAAGRXhpZgAATU0AKgAAAAgAAwEaAAUAAAABAAAAMgEbAAUAAAABAAAAOgEoAAMAAAABAAIAAAAAAAAAAAAZAAAAAQAAABkAAAABAAAARCgBr6LyRoF8xePn6/4jv//ooP1f/Bn//rf2f9RM90yyZ/o+g2D/rxM+NDzET+97Rl4Ft+rXIEufMOZLr85PrNvVgkfgAAAAECgBr07AkpAjRfFAYWUZwT4=', 'base64'));
  await fs.copyFile(file('photo.heic'), file('photo.heif'));
  if (process.platform === 'win32' && tools.magickPath) {
    const { stdout } = await run(tools.magickPath, ['identify', '-limit', 'memory', '256MiB', '-limit', 'map', '256MiB', '-format', '%m %w %h', file('photo.heic') + '[0]']);
    console.log('Windows HEIC decoder:', JSON.stringify(stdout));
  }
  for (const ext of ['mp3', 'wav', 'flac', 'aac', 'm4a']) {
    await run(tools.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', file('audio.' + ext)]);
  }
  for (const ext of ['mov', 'mkv', 'webm', 'mp4']) {
    await run(tools.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=12:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', ext === 'webm' ? 'libvpx-vp9' : 'libx264', '-c:a', ext === 'webm' ? 'libopus' : 'aac', '-shortest', file('video.' + ext)]);
  }
  await run(tools.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=12:duration=2', '-c:v', 'libx264', file('silent.mp4')]);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('中文工作表');
  sheet.addRows([['姓名', '备注', '值'], ['小鲸', '逗号,"引号"\n换行', 3], ['保留文本', '=1+1', '00123']]);
  workbook.addWorksheet('第二张').addRow(['不应混入第一张']);
  await workbook.xlsx.writeFile(file('table.xlsx'));
  const csv = '\ufeff姓名,备注,值\r\n小鲸,"逗号,\"\"引号\"\"\n换行",3\r\n保留文本,=1+1,00123\r\n';
  const tsv = '\ufeff姓名\t备注\t值\r\n小鲸\t"内部\t制表符\n换行"\t3\r\n保留文本\t=1+1\t00123\r\n';
  await fs.writeFile(file('table.csv'), csv);
  await fs.writeFile(file('table.tsv'), tsv);
  await fs.writeFile(file('plain.txt'), '中文纯文本\n第二行 **保持原样**\n');
  await fs.writeFile(file('notes.md'), '# 中文标题\n\n**重要内容** [链接](https://example.com)\n\n- 项目一\n\n```js\nconst value = "**代码**";\n```\n');
  await fs.writeFile(file('bad.csv'), 'a,b\n1,2,3');
  const fodp = file('slides.fodp');
  await fs.writeFile(fodp, `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.presentation">
<office:automatic-styles><style:page-layout style:name="PL"><style:page-layout-properties fo:page-width="28cm" fo:page-height="21cm" style:print-orientation="landscape"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Default" style:page-layout-name="PL"/></office:master-styles>
<office:body><office:presentation>${[1, 2].map(n => `<draw:page draw:name="Slide${n}" draw:master-page-name="Default"><draw:frame svg:x="2cm" svg:y="2cm" svg:width="24cm" svg:height="8cm"><draw:text-box><text:p>DESKTOP PET SLIDE ${n}</text:p><text:p>中文幻灯片 ${n}：小鲸转换测试</text:p></draw:text-box></draw:frame></draw:page>`).join('')}</office:presentation></office:body></office:document>`);
  const profile = '-env:UserInstallation=' + pathToFileURL(path.join(root, 'fixture-profile')).href;
  for (const [input, format] of [[fodp, 'pptx:Impress MS PowerPoint 2007 XML'], [file('slides.pptx'), 'ppt:MS PowerPoint 97'], [file('table.xlsx'), 'xls:MS Excel 97']]) {
    await run(tools.executable, [profile, '--headless', '--norestore', '--convert-to', format, '--outdir', inputs, input], { timeout: 120_000 });
  }
  const results = [];
  let sequence = 0;
  async function check(inputName, target, verify) {
    const input = file(inputName);
    const before = await hash(input);
    const source = await inspectInput(input);
    const extension = source.category === 'presentation' && target !== 'pdf' ? 'zip' : target;
    const destination = path.join(outputs, `${++sequence}-${path.parse(inputName).name}-to-${target}.${extension}`);
    const result = await convertFile(input, destination, tools.executable, { target, tools, details: true });
    assert.equal(await hash(input), before, '原文件字节不变');
    assert.ok((await fs.stat(result.path)).size > 0);
    await verify(result.path, result.warnings);
    results.push({ input: inputName, target, output: path.basename(result.path), warnings: result.warnings });
    console.log(`PASS ${inputName} → ${target}`);
  }
  for (const source of ['jpg', 'png', 'webp', 'heic', 'heif']) {
    for (const target of ['jpg', 'png', 'webp'].filter(ext => ext !== source)) {
      await check((['heic', 'heif'].includes(source) ? 'photo.' : 'image.') + source, target, async output => {
        const info = await sharp(output).metadata();
        assert.equal(info.width, 32); assert.equal(info.height, 24);
        assert.equal(info.format, target === 'jpg' ? 'jpeg' : target);
      });
    }
  }
  await check('rotated.jpg', 'png', async output => {
    const info = await sharp(output).metadata();
    assert.equal(info.width, 24); assert.equal(info.height, 32);
  });
  for (const source of ['mp3', 'wav', 'flac', 'aac', 'm4a']) {
    for (const target of ['mp3', 'wav', 'flac', 'aac', 'm4a'].filter(ext => ext !== source)) {
      await check('audio.' + source, target, async output => {
        const info = await probeMedia(output, tools);
        assert.ok(info.streams.some(stream => stream.codec_type === 'audio'));
        assert.ok(Math.abs(Number(info.format.duration) - 2) < .5);
      });
    }
  }
  for (const source of ['mov', 'mkv', 'webm', 'mp4']) {
    for (const target of ['mp4', 'mp3', 'wav', 'gif'].filter(ext => ext !== source)) {
      await check('video.' + source, target, async output => {
        const info = await probeMedia(output, tools);
        const video = info.streams.find(stream => stream.codec_type === 'video');
        if (target === 'mp4') { assert.equal(video.codec_name, 'h264'); assert.equal(video.width, 96); assert.equal(video.height, 64); }
        if (target === 'gif') { assert.equal(video.codec_name, 'gif'); assert.ok(Number(info.format.duration) > 1.8); }
      });
    }
  }
  for (const source of ['xlsx', 'xls', 'csv', 'tsv']) {
    for (const target of ['xlsx', 'csv', 'tsv'].filter(ext => ext !== source)) {
      await check('table.' + source, target, async (output, warnings) => {
        if (target === 'xlsx') {
          const book = new ExcelJS.Workbook(); await book.xlsx.readFile(output);
          assert.equal(book.worksheets[0].getCell('A2').value, '小鲸');
          if (['csv', 'tsv'].includes(source)) { assert.equal(book.worksheets[0].getCell('B3').type, ExcelJS.ValueType.String); assert.equal(book.worksheets[0].getCell('C3').value, '00123'); }
        } else {
          const rows = parseTable(await readText(output), target);
          assert.equal(rows.length, 3); assert.equal(rows[1][0], '小鲸');
          assert.match(rows[1][1], /换行/); assert.equal(rows[2][1], '=1+1'); assert.equal(rows[2][2], '00123');
          if (['xlsx', 'xls'].includes(source)) assert.ok(warnings.some(warning => warning.includes('第一张')));
        }
      });
    }
  }
  for (const source of ['pptx', 'ppt']) {
    for (const target of ['pdf', 'jpg', 'png']) {
      await check('slides.' + source, target, async output => {
        if (target === 'pdf') {
          const { stdout } = await run(path.join(path.dirname(tools.pdftoppmPath), process.platform === 'win32' ? 'pdfinfo.exe' : 'pdfinfo'), [output]); assert.match(stdout, /Pages:\s*2/);
          const text = await run('/opt/homebrew/bin/pdftotext', [output, '-']); assert.match(text.stdout, /DESKTOP PET SLIDE 1/); assert.match(text.stdout, /中文幻灯片/);
        } else {
          const stdout = [...(await require('../src/conversion-utils.cjs').zipEntries(output)).keys()].join('\n');
          assert.equal(stdout.split('\n').filter(name => name.endsWith('.' + target)).length, 2);
        }
      });
    }
  }
  await check('plain.txt', 'md', async output => assert.equal(await readText(output), await readText(file('plain.txt'))));
  await check('notes.md', 'txt', async output => { const text = await readText(output); assert.match(text, /中文标题/); assert.match(text, /重要内容 链接/); assert.ok(!text.includes('# 中文标题')); assert.match(text, /\*\*代码\*\*/); });
  for (const [name, target, reason] of [['silent.mp4', 'mp3', /没有音频/], ['bad.csv', 'xlsx', /表格文本格式/]]) {
    const destination = path.join(outputs, 'failure-' + target + '.' + target);
    await assert.rejects(convertFile(file(name), destination, tools.executable, { target, tools }), reason);
    await assert.rejects(fs.access(destination));
    console.log('PASS 中文失败与无虚假结果：' + name);
  }
  await fs.writeFile(path.join(root, 'results.json'), JSON.stringify({ count: results.length, tools: { office: tools.version, ffmpeg: tools.ffmpegPath, poppler: tools.pdftoppmPath }, results }, null, 2));
  console.log(`PASS ${results.length} 条真实转换方向，原文件保护；结果位于 artifacts/format-expansion。`);
})().catch(error => { console.error(error); process.exitCode = 1; });
