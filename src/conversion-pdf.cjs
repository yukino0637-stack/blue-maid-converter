const { PDFDocument } = require('pdf-lib');
const ExcelJS = require('exceljs');
const sharp = require('sharp');
const { fs, path, command, checkOutput, zipFiles, zipEntries, escape, htmlDocument } = require('./conversion-utils.cjs');
async function loadPdf(input, password) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(await fs.readFile(input)), password, isEvalSupported: false, useSystemFonts: false,
    disableFontFace: true, disableAutoFetch: true, disableStream: true, verbosity: 0 });
  try { const pdf = await task.promise; pdf.destroy = () => task.destroy(); return pdf; } catch { await task.destroy(); throw new Error('PDF 无法读取鲸。文件可能损坏或需要正确的原密码。'); }
}
async function pageCount(input) {
  let pdf;
  try { pdf = await loadPdf(input); return pdf.numPages; } catch { return undefined; } finally { await pdf?.destroy(); }
}
function linesFromItems(items, tolerance = 3) {
  const rows = [];
  for (const item of items.sort((a, b) => a.y - b.y || a.x - b.x)) {
    let row = rows.find(row => Math.abs(row.y - item.y) <= tolerance);
    if (!row) { row = { y: item.y, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  return rows.map(row => {
    row.items.sort((a, b) => a.x - b.x);
    const cells = [];
    for (const item of row.items) {
      const last = cells.at(-1);
      if (last && item.x - last.right < Math.max(tolerance * 5, 12)) { last.text += (item.x - last.right > tolerance ? ' ' : '') + item.text; last.right = item.x + item.width; }
      else cells.push({ text: item.text, x: item.x, right: item.x + item.width });
    }
    return { ...row, cells, text: cells.map(c => c.text).join('\t') };
  });
}
async function ocr(input, workspace, tools, index = 0) {
  async function recognize(image, suffix) {
    const prefix = path.join(workspace.dir, 'ocr-' + index + suffix);
    await command(tools.tesseractPath, [image, prefix, '-l', tools.ocrLanguages || 'chi_sim+eng', '--psm', '3', 'txt', 'tsv'], 180_000);
    const text = (await fs.readFile(prefix + '.txt', 'utf8')).trim();
    const tsv = await fs.readFile(prefix + '.tsv', 'utf8');
    const items = tsv.split(/\r?\n/).slice(1).map(line => line.split('\t')).filter(row => row[0] === '5' && row[11]?.trim()).map(row => ({
      x: Number(row[6]), y: Number(row[7]), width: Number(row[8]), height: Number(row[9]), confidence: Number(row[10]), text: row.slice(11).join('\t').trim(),
    }));
    const confidence = items.length ? items.reduce((sum, item) => sum + item.confidence, 0) / items.length : 0;
    return { text, items, confidence };
  }
  let result = await recognize(input, '');
  // Very large glyphs can reduce LSTM accuracy. Retry at a typical text height,
  // and keep the retry only when confidence improves without dropping most text.
  const heights = result.items.map(item => item.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)];
  if (result.confidence < 85 && median > 50) {
    const info = await sharp(input).metadata(), resized = path.join(workspace.dir, 'ocr-resized-' + index + '.png');
    await sharp(input).resize({ width: Math.max(100, Math.round(info.width * 40 / median)) }).png().toFile(resized);
    const retry = await recognize(resized, '-retry');
    if (retry.confidence > result.confidence && retry.text.replace(/\s/g, '').length >= result.text.replace(/\s/g, '').length * .8) result = retry;
  }
  if (!result.text || !result.items.length) throw new Error('扫描页没有识别出可读文字鲸。请使用清晰图片或手动 OCR 后重试。');
  return { text: result.text, lines: linesFromItems(result.items, 8), confidence: result.confidence };
}
async function imageCoverage(page, width, height) {
  const { OPS, Util } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const list = await page.getOperatorList(), stack = [];
  let matrix = [1, 0, 0, 1, 0, 0], area = 0;
  for (const [index, op] of list.fnArray.entries()) {
    if (op === OPS.save) stack.push([...matrix]);
    else if (op === OPS.restore) matrix = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (op === OPS.transform) matrix = Util.transform(matrix, list.argsArray[index]);
    else if ([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(op)) area = Math.max(area, Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]));
  }
  return { coverage: area / (width * height), hasContent: list.fnArray.length > 0 };
}
async function extractPages(input, workspace, tools, params = {}) {
  const pdf = await loadPdf(input, params.password);
  if (pdf.numPages > 200) { await pdf.destroy(); throw new Error('PDF 文本转换最多支持 200 页鲸。'); }
  const pages = [], warnings = [];
  try {
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index), viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter(item => item.str?.trim()).map(item => ({ text: item.str, x: item.transform[4], y: viewport.height - item.transform[5], width: item.width, height: item.height }));
      let usedOcr = false, lines = linesFromItems(items), text = lines.map(line => line.text).join('\n');
      const chars = text.replace(/\s/g, '').length;
      const painted = await imageCoverage(page, viewport.width, viewport.height);
      if (params.forceOcr || chars === 0 && painted.hasContent || painted.coverage > .3) {
        if (!tools.ocr || !tools.poppler) throw new Error('第 ' + index + ' 页是扫描页，需要安装 Tesseract、中文语言包与 Poppler 鲸。');
        const prefix = path.join(workspace.dir, 'scan-' + index);
        const passwordArgs = params.password ? ['-upw', params.password] : [];
        // Render a decrypted private copy if a password is required, to keep passwords out of process arguments.
        let renderInput = input;
        if (passwordArgs.length) renderInput = (await pdfOperation(input, workspace, tools, { pdfMode: 'decrypt', password: params.password })).output;
        await command(tools.pdftoppmPath, ['-f', String(index), '-l', String(index), '-singlefile', '-png', '-r', '180', '-scale-to', '4096', renderInput, prefix]);
        const result = await ocr(prefix + '.png', workspace, tools, index);
        const normalized = result.text.replace(/\s/g, '');
        const missing = lines.filter(line => !normalized.includes(line.text.replace(/\s/g, '')));
        text = [...missing.map(line => line.text), result.text].join('\n');
        lines = [...missing.map(line => ({ text: line.text, cells: [{ x: 0, right: 0, text: line.text }] })), ...result.lines]; usedOcr = true;
        warnings.push('第 ' + index + ' 页使用 OCR，文字请核对' + (result.confidence < 85 ? '（置信度偏低）' : '') + '鲸。');
      }
      if (!text.trim()) warnings.push('第 ' + index + ' 页没有可读文字，已保留页码位置鲸。');
      pages.push({ text, lines, ocr: usedOcr }); page.cleanup();
    }
    return { pages, warnings };
  } finally { await pdf.destroy(); }
}
async function pdfOperation(input, workspace, tools, params = {}) {
  const mode = params.pdfMode || 'split';
  if (!['split', 'group', 'encrypt', 'decrypt'].includes(mode)) throw new Error('不支持的 PDF 操作鲸。');
  if (['encrypt', 'decrypt'].includes(mode)) {
    const password = params.password;
    if (typeof password !== 'string' || !password || password.length > 256 || /[\r\n\0]/.test(password)) throw new Error('请填写有效密码鲸（最多 256 个字符，不含换行）。');
    const output = path.join(workspace.dir, 'secured-' + require('node:crypto').randomUUID() + '.pdf');
    const passwordFile = path.join(workspace.dir, 'pdf-password-' + require('node:crypto').randomUUID());
    await fs.writeFile(passwordFile, password, { mode: 0o600 });
    const argsFile = path.join(workspace.dir, 'qpdf-arguments-' + require('node:crypto').randomUUID());
    const args = mode === 'decrypt' ? ['--password-file=' + passwordFile, '--decrypt', input, output] :
      [input, '--encrypt', password, require('node:crypto').randomBytes(32).toString('hex'), '256', '--', output];
    await fs.writeFile(argsFile, args.join('\n'), { mode: 0o600 });
    await command(tools.qpdfPath, ['@' + argsFile]); await checkOutput(output);
    await fs.rm(argsFile, { force: true }); await fs.rm(passwordFile, { force: true });
    return { output, warnings: [mode === 'encrypt' ? '已采用 AES-256 加密。请妥善保存密码，忘记后无法恢复鲸。' : '已用提供的原密码解密鲸。'] };
  }
  const group = mode === 'split' ? 1 : Number(params.groupPages || 2);
  if (!Number.isInteger(group) || group < 1 || group > 200) throw new Error('每组页数须为 1–200 的整数鲸。');
  const pdf = await PDFDocument.load(await fs.readFile(input));
  if (pdf.getPageCount() > 200) throw new Error('PDF 拆分最多支持 200 页鲸。');
  const files = [];
  for (let first = 0; first < pdf.getPageCount(); first += group) {
    const result = await PDFDocument.create();
    const pages = await result.copyPages(pdf, Array.from({ length: Math.min(group, pdf.getPageCount() - first) }, (_, i) => first + i));
    pages.forEach(page => result.addPage(page));
    files.push({ name: 'pages-' + String(first + 1).padStart(3, '0') + '-' + Math.min(first + group, pdf.getPageCount()) + '.pdf', bytes: Buffer.from(await result.save()) });
  }
  return { output: await zipFiles(files, path.join(workspace.dir, 'result.zip')), warnings: ['按原顺序拆分为 ' + files.length + ' 份 PDF，保存为 ZIP 鲸。'] };
}
async function imagesPdf(inputs, workspace, tools) {
  const pdf = await PDFDocument.create();
  for (const [index, item] of inputs.entries()) {
    const { prepared } = await require('./conversion-media.cjs').preparedImage(item.path, item, workspace, tools);
    const bytes = await sharp(prepared, { limitInputPixels: 40_000_000 }).rotate().flatten({ background: 'white' }).jpeg({ quality: 95 }).toBuffer();
    const image = await pdf.embedJpg(bytes);
    const scale = Math.min(1, 1440 / Math.max(image.width, image.height));
    const page = pdf.addPage([image.width * scale, image.height * scale]);
    page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    if (index >= 200) throw new Error('图片合并最多支持 200 张鲸。');
  }
  const output = path.join(workspace.dir, 'images.pdf'); await fs.writeFile(output, await pdf.save());
  return { output, warnings: ['按文件列表顺序一图一页；透明背景变为白色，动图仅取第一帧鲸。'] };
}
async function mergePdf(inputs, workspace) {
  const outputPdf = await PDFDocument.create();
  for (const input of inputs) {
    const pdf = await PDFDocument.load(await fs.readFile(input.path));
    if (pdf.getPageCount() + outputPdf.getPageCount() > 200) throw new Error('合并结果最多支持 200 页鲸。');
    const copied = await outputPdf.copyPages(pdf, pdf.getPageIndices()); copied.forEach(page => outputPdf.addPage(page));
  }
  const output = path.join(workspace.dir, 'merged.pdf'); await fs.writeFile(output, await outputPdf.save());
  return { output, warnings: ['按文件列表顺序合并；原数字签名与书签不会保留鲸。'] };
}
async function zipImages(input, workspace, tools) {
  const entries = await zipEntries(input), images = [];
  const { describeFormat } = require('./formats.cjs');
  for (const [name, bytes] of [...entries].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))) {
    if (name.startsWith('__MACOSX/') || path.basename(name).startsWith('.')) continue;
    const format = describeFormat(path.extname(name));
    if (format?.category !== 'image') continue;
    const output = path.join(workspace.dir, 'zip-image-' + images.length + '.' + format.ext); await fs.writeFile(output, bytes);
    images.push({ path: output, ...format });
  }
  if (!images.length) throw new Error('ZIP 中没有支持的图片鲸。');
  return imagesPdf(images, workspace, tools);
}
async function pdfImages(input, target, workspace, source, tools, params) {
  let decoded = input;
  if (params.password) decoded = (await pdfOperation(input, workspace, tools, { pdfMode: 'decrypt', password: params.password })).output;
  const count = await pageCount(decoded);
  if (!count || count > 200) throw new Error('PDF 图片导出需要有效 PDF，且最多 200 页鲸。');
  const dir = path.join(workspace.dir, 'pdf-images'); await fs.mkdir(dir);
  await command(tools.pdftoppmPath, ['-png', '-r', '150', '-scale-to', '4096', decoded, path.join(dir, 'page')]);
  const images = (await fs.readdir(dir)).filter(name => name.endsWith('.png')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (images.length !== count) throw new Error('PDF 导出页数不完整鲸。');
  const files = [];
  for (const [index, name] of images.entries()) {
    const output = path.join(workspace.dir, 'page-' + String(index + 1).padStart(3, '0') + '.' + target);
    await sharp(path.join(dir, name)).toFormat(target === 'jpg' ? 'jpeg' : target).toFile(output);
    files.push({ path: output, name: path.basename(output) });
  }
  return { output: source.pages === 1 ? files[0].path : await zipFiles(files, path.join(workspace.dir, 'result.zip')), warnings: count > 1 ? ['已按页码保存 ' + count + ' 张图片为 ZIP 鲸。'] : [] };
}
async function pdfText(input, target, workspace, tools, params) {
  const { pages, warnings } = await extractPages(input, workspace, tools, params);
  const output = path.join(workspace.dir, 'result.' + target);
  if (target === 'xlsx') {
    if (params.tableMode && !['auto', 'position', 'structure'].includes(params.tableMode)) throw new Error('不支持的表格提取方式鲸。');
    const advanced = params.tableMode !== 'position' && (params.tableMode === 'structure' || tools.structure && pages.some(page => page.ocr));
    const structures = advanced ? await require('./conversion-structure.cjs').recognizeTables(input, pages, workspace, tools, params) : new Map();
    const workbook = new ExcelJS.Workbook();
    let recognized = 0;
    for (const [index, page] of pages.entries()) {
      const tables = structures.get(index) || [];
      for (const [tableIndex, table] of tables.entries()) {
        const sheet = workbook.addWorksheet('第' + (index + 1) + '页表' + (tableIndex + 1));
        require('./conversion-structure.cjs').addHtmlTable(sheet, table.html); recognized++;
      }
      // Keep readable page text alongside recovered tables, including text outside the table.
      const sheet = workbook.addWorksheet('第' + (index + 1) + (tables.length ? '页原文' : '页'));
      const anchors = [];
      for (const line of page.lines) for (const cell of line.cells) if (!anchors.some(x => Math.abs(x - cell.x) < 16)) anchors.push(cell.x);
      anchors.sort((a, b) => a - b);
      for (const line of page.lines) {
        const row = Array(anchors.length).fill('');
        for (const cell of line.cells) {
          const index = anchors.reduce((best, x, i) => Math.abs(x - cell.x) < Math.abs(anchors[best] - cell.x) ? i : best, 0);
          row[index] += (row[index] ? ' ' : '') + cell.text;
        }
        sheet.addRow(row);
      }
    }
    if (advanced) warnings.push(recognized ? '本机结构引擎恢复了 ' + recognized + ' 个表格与推测的合并区域；另保留逐页文字，公式和结构仍请核对鲸。' : '结构引擎未检测到表格，结果按文字位置推测行列，请核对鲸。');
    await workbook.xlsx.writeFile(output);
    if (!recognized) warnings.push('按文字位置推测行列，一页一张工作表；合并单元格、公式与复杂扫描表格不能可靠还原，请核对鲸。');
  } else {
    const blocks = pages.map((page, index) => '## 第 ' + (index + 1) + ' 页\n\n' + page.lines.map(line => line.text).join('\n')).join('\n\n');
    if (target === 'txt') await fs.writeFile(output, pages.map(page => page.text).join('\n\n\f\n\n'));
    else if (target === 'md') await fs.writeFile(output, blocks);
    else {
      const html = path.join(workspace.dir, 'pdf-text.html');
      await fs.writeFile(html, htmlDocument(pages.map((page, index) => '<h2>第 ' + (index + 1) + ' 页</h2><pre>' + escape(page.text) + '</pre>').join('')));
      if (target === 'html') await fs.copyFile(html, output);
      else await command(tools.pandocPath, ['--sandbox', '-f', 'html', '-t', 'docx', html, '-o', output]);
    }
    warnings.push('按页保留可读文字；复杂排版、插图、公式和表格样式不会完整还原鲸。');
  }
  await checkOutput(output); return { output, warnings };
}
async function imageOcr(input, target, workspace, source, tools) {
  const { prepared } = await require('./conversion-media.cjs').preparedImage(input, source, workspace, tools);
  const png = path.join(workspace.dir, 'ocr-input.png'); await sharp(prepared).rotate().flatten({ background: 'white' }).png().toFile(png);
  const result = await ocr(png, workspace, tools);
  const output = path.join(workspace.dir, 'result.' + target);
  if (target === 'docx') {
    const html = path.join(workspace.dir, 'ocr.html'); await fs.writeFile(html, htmlDocument('<pre>' + escape(result.text) + '</pre>'));
    await command(tools.pandocPath, ['--sandbox', '-f', 'html', '-t', 'docx', html, '-o', output]);
  } else await fs.writeFile(output, result.text);
  return { output, warnings: ['已使用中英文 OCR；仅识别第一帧，文字和布局请核对鲸。' + (result.confidence < 85 ? '识别置信度偏低。' : '')] };
}
module.exports = { pageCount, linesFromItems, extractPages, pdfOperation, imagesPdf, mergePdf, zipImages, pdfImages, pdfText, imageOcr };
