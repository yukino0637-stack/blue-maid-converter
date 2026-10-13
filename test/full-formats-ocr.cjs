// Actual text-bearing containers for the image/OCR routes missed by blank image samples.
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { fs, path, command } = require('../src/conversion-utils.cjs');
const { convertFile, detectLibreOffice, wordXml } = require('../src/converter.cjs');
const { detectExtraTools } = require('../src/formats.cjs');
(async () => {
  const tools = { ...await detectLibreOffice(), ...await detectExtraTools() };
  const root = path.resolve('artifacts/full-format-tests/ocr-extra'); await fs.rm(root, { recursive: true, force: true }); await fs.mkdir(root);
  const input = path.resolve('artifacts/full-format-tests/inputs/scan.png'), samples = [];
  for (const ext of ['jpeg', 'jfif', 'jpe', 'tif']) {
    const output = path.join(root, 'sample.' + ext); await sharp(input).toFormat(ext === 'tif' ? 'tiff' : 'jpeg').toFile(output); samples.push(output);
  }
  for (const ext of ['heic', 'heif']) {
    const output = path.join(root, 'sample.' + ext); if (process.platform === 'darwin') await command('/usr/bin/sips', ['-s', 'format', 'heic', input, '--out', output]); else await command(tools.magickPath, [input, output]); samples.push(output);
  }
  const ai = path.join(root, 'sample.ai'); await fs.copyFile(path.resolve('artifacts/full-format-tests/inputs/scan-native.pdf'), ai); samples.push(ai);
  const svg = path.join(root, 'sample.svg'); await fs.writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="400"><rect width="100%" height="100%" fill="white"/><text x="80" y="200" font-family="Arial" font-size="56" fill="black">OCR_CHECK 123456 ABCDEFG</text></svg>'); samples.push(svg);
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height, header = Buffer.alloc(40); header.write('8BPS'); header.writeUInt16BE(1, 4); header.writeUInt16BE(3, 12); header.writeUInt32BE(info.height, 14); header.writeUInt32BE(info.width, 18); header.writeUInt16BE(8, 22); header.writeUInt16BE(3, 24);
  const planes = Buffer.alloc(pixels * 3); for (let i = 0; i < pixels; i++) for (let c = 0; c < 3; c++) planes[c * pixels + i] = data[i * 3 + c];
  const psd = path.join(root, 'sample.psd'); await fs.writeFile(psd, Buffer.concat([header, planes])); samples.push(psd);
  const j2k = path.join(root, 'sample.j2k'); await command(tools.ffmpegPath, ['-v', 'error', '-i', input, '-c:v', 'jpeg2000', '-format', 'j2k', '-f', 'image2', j2k]); samples.push(j2k);
  const records = [];
  for (const input of samples) for (const target of ['txt', 'md', 'docx']) {
    const ext = path.extname(input).slice(1), output = path.join(root, ext + '-text.' + target);
    await convertFile(input, output, tools.executable, { target, tools });
    const text = target === 'docx' ? await wordXml(output) : await fs.readFile(output, 'utf8');
    assert.match(text, /OCR_CHECK/); assert.match(text, /123456/);
    records.push({ input: ext, target, status: 'pass' }); console.log('PASS ' + ext + ' OCR → ' + target + ' 已知文字');
  }
  await fs.writeFile(path.join(root, '../ocr-report.json'), JSON.stringify(records, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
