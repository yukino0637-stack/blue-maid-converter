const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { command, zipEntries, zipFiles } = require('../src/conversion-utils.cjs');
module.exports = async function makeSpecialFixtures(dir, soffice) {
  await command(soffice, ['-env:UserInstallation=' + pathToFileURL(path.join(dir, 'doc-fixture-profile')).href, '--headless', '--convert-to', 'doc:MS Word 97', '--outdir', dir, path.join(dir, 'document.docx')]);
  const entries = await zipEntries(path.join(dir, 'table.xlsx'));
  entries.set('[Content_Types].xml', Buffer.from(entries.get('[Content_Types].xml').toString().replace('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', 'application/vnd.ms-excel.sheet.macroEnabled.main+xml')));
  const xlsm = path.join(dir, 'table.xlsm'); await fs.rm(xlsm, { force: true }); await zipFiles([...entries].map(([name, bytes]) => ({ name, bytes })), xlsm);
  const title = Buffer.from('Own test book');
  const html = Buffer.from('<html><head><title>Own test book</title></head><body><h1>第一章</h1><p>MOBI_CHECK 中文内容 123</p><mbp:pagebreak/><h1>第二章</h1><p>CHAPTER_TWO 第二章内容</p></body></html>');
  const record = Buffer.alloc(264 + title.length);
  record.writeUInt16BE(1, 0); record.writeUInt32BE(html.length, 4); record.writeUInt16BE(1, 8); record.writeUInt16BE(4096, 10);
  record.write('MOBI', 16); record.writeUInt32BE(232, 20); record.writeUInt32BE(2, 24); record.writeUInt32BE(65001, 28); record.writeUInt32BE(1, 32); record.writeUInt32BE(6, 36);
  record.writeUInt32BE(264, 84); record.writeUInt32BE(title.length, 88); record.writeUInt32BE(0xffffffff, 108); record.writeUInt32BE(0xffffffff, 112); record.writeUInt32BE(0xffffffff, 244); record.writeUInt32BE(64, 128); record.write('EXTH', 248); record.writeUInt32BE(12, 252); title.copy(record, 264);
  const header = Buffer.alloc(96); header.write('Own test book'); header.write('BOOKMOBI', 60); header.writeUInt16BE(2, 76); header.writeUInt32BE(96, 78); header.writeUInt32BE(96 + record.length, 86);
  await fs.writeFile(path.join(dir, 'book.mobi'), Buffer.concat([header, record, html]));
  console.log('Generated actual DOC, XLSM (without macros), and a minimal unencrypted MOBI book.');
};
