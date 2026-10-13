const { XMLParser } = require('fast-xml-parser');
const { fs, path, command, safeHtml } = require('./conversion-utils.cjs');
const MODEL_NAMES = ['PicoDet_layout_1x_table', 'PP-LCNet_x1_0_table_cls', 'SLANet_plus', 'RT-DETR-L_wired_table_cell_det', 'RT-DETR-L_wireless_table_cell_det', 'PP-OCRv5_mobile_det', 'PP-OCRv5_mobile_rec'];
async function detectStructure() {
  const root = require('./platform-tools.cjs').structureRoot();
  try {
    const ready = JSON.parse(await fs.readFile(path.join(root, 'ready.json'), 'utf8'));
    if (ready.version !== 1 || ready.tested !== true) return {};
    for (const name of MODEL_NAMES) await fs.access(path.join(root, 'models', name, 'inference.yml'));
    const structurePath = require('./platform-tools.cjs').pythonIn(root); await fs.access(structurePath, require('node:fs').constants.X_OK);
    return { structure: true, structurePath };
  } catch { return { structure: false }; }
}
function addHtmlTable(sheet, html) {
  const safe = safeHtml(html).replace(/<(br|hr)\s*>/g, '<$1/>').replaceAll('&nbsp;', '&#160;');
  const nodes = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false, trimValues: false }).parse(safe);
  const find = (items, tag) => items.flatMap(node => node[tag] ? [node] : Object.entries(node).filter(([key, value]) => key !== ':@' && Array.isArray(value)).flatMap(([, value]) => find(value, tag)));
  const text = items => items.map(node => node['#text'] !== undefined ? String(node['#text']) : node.br ? '\n' : Object.entries(node).filter(([key, value]) => key !== ':@' && Array.isArray(value)).map(([, value]) => text(value)).join('')).join('');
  const table = find(nodes, 'table')[0]; if (!table) throw new Error('表格识别结果没有有效结构鲸。');
  const rows = find(table.table, 'tr'); if (!rows.length || rows.length > 100_000) throw new Error('表格行数无效或过多鲸。');
  const occupied = new Set(); let total = 0;
  for (const [index, row] of rows.entries()) {
    let column = 1;
    for (const node of row.tr.filter(node => node.td || node.th)) {
      while (occupied.has(index + 1 + ':' + column)) column++;
      const attrs = node[':@'] || {}, width = Number(attrs['@_colspan'] || 1), height = Number(attrs['@_rowspan'] || 1);
      if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 1000) || column + width > 16_384 || index + height > 100_000) throw new Error('识别出的合并单元格超出限制鲸。');
      total += width * height; if (total > 1_000_000) throw new Error('识别表格超过 100 万单元格鲸。');
      sheet.getCell(index + 1, column).value = text(node.td || node.th);
      for (let r = index + 1; r < index + 1 + height; r++) for (let c = column; c < column + width; c++) occupied.add(r + ':' + c);
      if (width > 1 || height > 1) sheet.mergeCells(index + 1, column, index + height, column + width - 1);
      column += width;
    }
  }
  return rows.length;
}
async function recognizeTables(input, pages, workspace, tools, params) {
  if (!tools.structurePath) throw new Error('高级扫描表格引擎未安装鲸。请运行 npm run setup:pdf-structure，或选择文字位置推测。');
  let rendered = input;
  if (params.password) rendered = (await require('./conversion-pdf.cjs').pdfOperation(input, workspace, tools, { pdfMode: 'decrypt', password: params.password })).output;
  const selected = pages.map((page, index) => ({ page, index })).filter(({ page }) => page.ocr || params.tableMode === 'structure');
  const images = [];
  for (const { index } of selected) {
    const prefix = path.join(workspace.dir, 'table-scan-' + index);
    await command(tools.pdftoppmPath, ['-f', String(index + 1), '-l', String(index + 1), '-singlefile', '-png', '-r', '180', '-scale-to', '3000', rendered, prefix]);
    images.push(prefix + '.png');
  }
  if (!images.length) return new Map();
  const output = path.join(workspace.dir, 'table-structures.json');
  await command(tools.structurePath, [require('./platform-tools.cjs').structureHelper(), output, ...images], 10 * 60_000, { env: { ...process.env, PDF_STRUCTURE_HOME: require('./platform-tools.cjs').structureRoot() } });
  const results = JSON.parse(await fs.readFile(output, 'utf8'));
  if (results.length !== selected.length) throw new Error('表格识别页数不完整鲸。');
  return new Map(selected.map(({ index }, i) => [index, results[i].tables]));
}
module.exports = { detectStructure, addHtmlTable, recognizeTables };
