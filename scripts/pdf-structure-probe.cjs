const assert = require('node:assert/strict');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const ExcelJS = require('exceljs');
const { fs, path, command } = require('../src/conversion-utils.cjs');
const { addHtmlTable } = require('../src/conversion-structure.cjs');
module.exports = async function probe(root, python, pdftoppm) {
  await fs.mkdir(root, { recursive: true });
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([800, 600]);
  const left = 70, top = 500, width = 660, rowHeight = 70;
  for (let row = 0; row <= 4; row++) page.drawLine({ start: { x: left, y: top - row * rowHeight }, end: { x: left + width, y: top - row * rowHeight }, thickness: 1.5 });
  for (let col = 0; col <= 3; col++) page.drawLine({ start: { x: left + col * width / 3, y: top - (col === 0 || col === 3 ? 0 : rowHeight) }, end: { x: left + col * width / 3, y: top - 4 * rowHeight }, thickness: 1.5 });
  page.drawText('MERGED_HEADER', { x: 265, y: 455, font, size: 24 });
  for (const [row, values] of [['Name', 'Category', 'Value'], ['Whale', 'Animal', '123'], ['Cat', 'Animal', '456']].entries()) {
    values.forEach((text, col) => page.drawText(text, { x: left + 20 + col * width / 3, y: top - (row + 1) * rowHeight - 43, font, size: 22 }));
  }
  const native = path.join(root, 'native.pdf'), prefix = path.join(root, 'scan');
  await fs.writeFile(native, await pdf.save());
  await command(pdftoppm, ['-singlefile', '-png', '-r', '180', native, prefix]);
  const image = prefix + '.png', results = path.join(root, 'results.json');
  await command(python, [path.resolve(__dirname, '../src/pdf-structure.py'), results, image], 10 * 60_000);
  const tables = JSON.parse(await fs.readFile(results, 'utf8'))[0].tables;
  const sheet = new ExcelJS.Workbook().addWorksheet('probe');
  assert.equal(tables.length, 1); addHtmlTable(sheet, tables[0].html);
  assert.equal(sheet.getCell('A1').value, 'MERGED_HEADER');
  assert.equal(sheet.getCell('C4').value, '456');
  assert.ok(sheet.model.merges.includes('A1:C1'));
  const scanPdf = await PDFDocument.create(), png = await scanPdf.embedPng(await fs.readFile(image));
  scanPdf.addPage([800, 600]).drawImage(png, { x: 0, y: 0, width: 800, height: 600 });
  const scanned = path.join(root, 'scanned.pdf'); await fs.writeFile(scanned, await scanPdf.save());
  return { scanned, image };
};
