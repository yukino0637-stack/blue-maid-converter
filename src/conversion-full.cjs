const { fs, path, checkOutput, zipFiles, zipEntries, command, decodeText } = require('./conversion-utils.cjs');
const rows = require('./conversion-routes.json').routes;
const routes = new Map(rows.map(row => [row.ext, row]));
const { RAW, AUDIO } = require('./conversion-media.cjs');
function describe(ext) {
  ext = ext.toLowerCase().replace(/^\./, '');
  const row = routes.get(ext);
  return row ? { ext, category: row.category, targets: [...row.targets], target: row.targets[0] } : null;
}
function legacy(source, target, params = {}) {
  if (params.encoding || params.forceOcr || params.textEncoding && params.textEncoding !== 'auto') return false;
  if (source.category === 'document') return ['doc', 'docx'].includes(source.ext) && target === 'pdf';
  if (source.category === 'pdf') return target === 'docx' && !params.forceOcr && !params.password;
  if (source.category === 'image') return ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(source.ext) && ['jpg', 'png', 'webp'].includes(target);
  if (source.category === 'audio') return ['mp3', 'wav', 'flac', 'aac', 'm4a'].includes(source.ext) && ['mp3', 'wav', 'flac', 'aac', 'm4a'].includes(target);
  if (source.category === 'video') return ['mp4', 'mov', 'mkv', 'webm'].includes(source.ext) && ['mp4', 'mp3', 'wav', 'gif'].includes(target);
  if (source.category === 'spreadsheet') return ['xls', 'xlsx', 'csv', 'tsv'].includes(source.ext) && ['xlsx', 'csv', 'tsv'].includes(target);
  if (source.category === 'presentation') return ['ppt', 'pptx'].includes(source.ext) && ['pdf', 'jpg', 'png'].includes(target);
  return source.category === 'text' && ['txt', 'md', 'markdown'].includes(source.ext) && ['txt', 'md'].includes(target);
}
function extension(source, target, params = {}) {
  if (source.category === 'presentation' && ['png', 'jpg', 'html'].includes(target)) return 'zip';
  if (source.category === 'pdf' && target === 'pdf') return ['encrypt', 'decrypt'].includes(params.pdfMode) ? 'pdf' : 'zip';
  if (source.category === 'pdf' && ['png', 'jpg', 'webp'].includes(target) && source.pages !== 1) return 'zip';
  return target;
}
function options(source, tools) {
  if (source.items) return options({ ...source, items: undefined }, tools).map(option => {
    const missing = source.items.flatMap(item => options(item, tools)).find(item => item.target === option.target && !item.enabled);
    return missing ? { ...option, enabled: false, reason: missing.reason, installCommand: missing.installCommand } : option;
  });
  const labels = { pdf: 'PDF 文档', docx: 'Word 文档', xlsx: 'Excel 表格', md: 'Markdown 文档', txt: '纯文本', html: 'HTML 网页', epub: 'EPUB 电子书' };
  return source.targets.map(target => {
    const needs = [];
    const office = () => needs.push(['available', 'LibreOffice', 'brew install --cask libreoffice']);
    const ffmpeg = () => needs.push(['ffmpeg', 'FFmpeg / ffprobe', 'brew install ffmpeg']);
    const poppler = () => needs.push(['poppler', 'Poppler', 'brew install poppler']);
    const pandoc = () => needs.push(['pandoc', 'Pandoc', 'brew install pandoc']);
    const ocr = () => needs.push(['ocr', 'Tesseract 中英文语言包', 'brew install tesseract tesseract-lang']);
    if (['audio', 'video', 'subtitle'].includes(source.category) && !(source.category === 'subtitle' && target === 'txt')) ffmpeg();
    if (source.category === 'image') {
      if (process.platform !== 'darwin' && ['heic', 'heif'].includes(source.ext)) needs.push(['heif', 'HEIC 解码器', require('./platform-tools.cjs').installHint('heif')]);
      if (RAW.has(source.ext)) needs.push(['raw', 'LibRaw', 'brew install libraw']);
      if (source.ext === 'jxl') { needs.push(['jxl', 'JPEG XL', 'brew install jpeg-xl']); ffmpeg(); }
      if (source.ext === 'ai') poppler();
      if (['psd', 'bmp', 'ico', 'tga', 'jp2', 'j2k', 'qoi', 'ppm'].includes(source.ext) || ['ico', 'bmp', 'tga', 'jp2', 'qoi', 'ppm', 'mp4', 'webm'].includes(target)) ffmpeg();
      if (target === 'jxl') needs.push(['jxl', 'JPEG XL', 'brew install jpeg-xl']);
      if (['txt', 'md', 'docx'].includes(target)) ocr();
      if (target === 'docx') pandoc();
    }
    if (source.category === 'document' && source.ext !== 'ofd' && !(source.ext === 'docx' && ['md', 'txt', 'html'].includes(target))) office();
    if (source.ext === 'ofd') needs.push(['ofdFont', 'OFD 中文字体', '参见 docs/CONVERSION-FORMATS.md 的字体说明']);
    if (source.category === 'presentation') { office(); if (['png', 'jpg'].includes(target)) poppler(); }
    if (source.category === 'spreadsheet' && !(['xls', 'xlsx', 'csv', 'tsv'].includes(source.ext) && ['xlsx', 'csv', 'tsv'].includes(target))) {
      if (!(['csv', 'tsv'].includes(source.ext) && ['txt', 'md', 'html', 'json', 'epub', 'docx'].includes(target))) office();
    }
    if (source.category === 'spreadsheet' && source.ext === 'xls') office();
    if (source.category === 'text') { if (['pdf', 'docx'].includes(target)) pandoc(); if (target === 'pdf') office(); }
    if (source.category === 'pdf') {
      if (target === 'pdf') needs.push(['qpdf', 'qpdf', 'brew install qpdf']);
      else if (['png', 'jpg', 'webp'].includes(target)) poppler();
      else {
        // Text PDFs need no OCR; scanned pages fail explicitly if OCR tools are missing.
        if (target === 'docx') { if (!tools.pdfSupported) pandoc(); else office(); }
      }
    }
    if (source.category === 'zip') ffmpeg();
    for (const need of needs) if (need[2].startsWith('brew install')) { const key = { available: 'libreoffice', jxl: 'jxl', raw: 'raw', ocr: 'ocr' }[need[0]] || need[0]; need[2] = require('./platform-tools.cjs').installHint(key); }
    const missing = needs.find(([key]) => !tools[key]);
    let note = '';
    if (source.category === 'pdf') note = target === 'pdf' ? '按页/分组拆分、AES-256 加密或凭原密码解密。' : target === 'xlsx' ? (tools.structure ? '扫描页可用本机结构引擎识别表格与合并区域；结果请核对。' : '按文字位置推测行列；复杂或合并单元格请核对。') : '文字布局可能变化，扫描页需要中英文 OCR。';
    if (source.category === 'image' && ['txt', 'md', 'docx'].includes(target)) note = '中英文 OCR，识别结果请核对。';
    if (source.category === 'presentation' && ['png', 'jpg'].includes(target)) note = '每页一张图片，按顺序保存为 ZIP。';
    if (source.category === 'presentation' && target === 'html') note = '网页与图片资源一起保存为 ZIP。';
    if (RAW.has(source.ext) || ['ai', 'psd', 'ofd', 'mobi'].includes(source.ext)) note = '实验格式；特殊编码或复杂对象可能不支持。';
    return { target, label: target === 'pdf' && source.category === 'pdf' ? 'PDF 拆分 / 加解密' : labels[target] || target.toUpperCase() + (AUDIO.includes(target) ? ' 音频' : ''),
      extension: source.inputs ? 'zip' : extension(source, target), enabled: !missing, reason: missing ? '未找到 ' + missing[1] : '', installCommand: missing?.[2] || '', note };
  });
}
async function validate(input, source) {
  if (source.category === 'zip' || ['docx', 'ofd', 'odt', 'ods', 'odp', 'xlsm', 'epub'].includes(source.ext)) {
    const entries = await zipEntries(input);
    const key = { docx: 'word/document.xml', ofd: 'OFD.xml', odt: 'content.xml', ods: 'content.xml', odp: 'content.xml', xlsm: 'xl/workbook.xml', epub: 'META-INF/container.xml' }[source.ext];
    if (key && !entries.has(key)) throw new Error('文件内容与扩展名不符鲸。');
    if (key?.endsWith('.xml')) require('./conversion-utils.cjs').xml(entries.get(key).toString('utf8'));
  } else if (source.category === 'text' || source.category === 'subtitle') {
    if (source.ext !== 'mobi') await decodeText(input);
    else { const bytes = await fs.readFile(input); if (bytes.length < 86 || !['BOOKMOBI', 'TEXtREAd'].includes(bytes.toString('ascii', 60, 68))) throw new Error('无效 MOBI 文件鲸。');
      const offset = bytes.readUInt32BE(78);
      if (offset < 86 || offset + 16 > bytes.length) throw new Error('MOBI 记录无效鲸。');
      if (bytes.readUInt16BE(offset + 12) !== 0) throw new Error('不支持加密或带 DRM 的 MOBI 鲸。');
    }
  } else if (source.category === 'image') {
    // Unsupported raster decoders are validated by the actual decoder in an isolated workspace.
    if (['jpg', 'jpeg', 'jfif', 'jpe', 'png', 'webp', 'gif', 'avif', 'tif', 'tiff', 'svg'].includes(source.ext)) {
      if (source.ext === 'svg') require('./conversion-utils.cjs').xml(await fs.readFile(input, 'utf8'));
      else {
        const info = await require('sharp')(input, { limitInputPixels: 40_000_000 }).metadata();
        const expected = ['jpeg', 'jfif', 'jpe', 'jpg'].includes(source.ext) ? 'jpeg' : source.ext === 'tif' ? 'tiff' : source.ext === 'avif' ? 'heif' : source.ext;
        if (info.format !== expected || source.ext === 'avif' && info.compression !== 'av1' || !info.width || !info.height) throw new Error('文件内容与图片扩展名不符鲸。');
      }
    }
  } else if (['audio', 'video'].includes(source.category)) {
    const { detectExtraTools, probeMedia } = require('./formats.cjs');
    const tools = await detectExtraTools();
    if (tools.ffmpeg) { const info = await probeMedia(input, tools); if (!info.streams?.some(s => s.codec_type === source.category)) throw new Error('文件缺少对应轨道鲸。'); }
  }
}
async function convert(input, target, workspace, source, tools, params = {}) {
  const docs = require('./conversion-documents.cjs'), pdf = require('./conversion-pdf.cjs'), media = require('./conversion-media.cjs');
  let result;
  if (source.category === 'document') result = await docs.document(input, target, workspace, source, tools, params);
  else if (source.category === 'image') {
    if (['txt', 'md', 'docx'].includes(target)) result = await pdf.imageOcr(input, target, workspace, source, tools);
    else if (target === 'pdf') result = await pdf.imagesPdf([{ ...source, path: input }], workspace, tools);
    else result = await media.image(input, target, workspace, source, tools);
  } else if (['audio', 'video'].includes(source.category)) result = await media.media(input, target, workspace, source, tools, params);
  else if (source.category === 'text') result = await docs.text(input, target, workspace, source, tools, params);
  else if (source.category === 'subtitle') result = await docs.subtitle(input, target, workspace, source, tools);
  else if (source.category === 'pdf') {
    if (target === 'pdf') result = await pdf.pdfOperation(input, workspace, tools, params);
    else if (['png', 'jpg', 'webp'].includes(target)) result = await pdf.pdfImages(input, target, workspace, source, tools, params);
    else result = await pdf.pdfText(input, target, workspace, tools, params);
  } else if (source.category === 'zip') result = await pdf.zipImages(input, workspace, tools);
  else if (source.category === 'spreadsheet') {
    if (['csv', 'tsv'].includes(source.ext) && ['txt', 'md', 'html', 'json', 'epub'].includes(target)) result = await docs.text(input, target, workspace, source, tools, params);
    else if (target === 'tsv') {
      const xlsx = (await docs.office(input, 'xlsx', workspace, source, tools)).output;
      result = await require('./formats.cjs').convertExtraInWorkspace(xlsx, 'tsv', workspace, { ...source, ext: 'xlsx' }, tools);
    } else result = await docs.office(input, target, workspace, source, tools);
  } else if (source.category === 'presentation') {
    if (['png', 'jpg'].includes(target)) {
      const converted = await docs.office(input, 'pdf', workspace, source, tools);
      result = await pdf.pdfImages(converted.output, target, workspace, { ...source, pages: undefined }, tools, params);
    } else if (target === 'html') {
      const converted = await docs.office(input, target, workspace, source, tools);
      const dir = path.dirname(converted.output), files = [];
      async function collect(folder) {
        for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
          const file = path.join(folder, entry.name);
          if (entry.isDirectory()) await collect(file);
          else if (entry.isFile()) files.push({ name: path.relative(dir, file).split(path.sep).join('/'), path: file });
          else throw new Error('演示文稿网页资源无效鲸。');
        }
      }
      await collect(dir);
      result = { output: await zipFiles(files, path.join(workspace.dir, 'result.zip')), warnings: ['网页及资源一起导出，复杂演示效果可能变化鲸。'] };
    } else result = await docs.office(input, target, workspace, source, tools);
  }
  if (!result) throw new Error('此路线尚未实现鲸。');
  await checkOutput(result.output); return result;
}
module.exports = { describe, legacy, extension, options, validate, convert, routes };
