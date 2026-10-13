// Offline conversion helpers. All paths are local; subprocesses never use a shell.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const yauzl = require('yauzl');
const yazl = require('yazl');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const sanitize = require('sanitize-html');
const run = promisify(execFile);
const LIMIT = 512 * 1024 * 1024;
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function xml(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) throw new Error('XML 无效或包含外部实体鲸。');
  return new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, processEntities: false }).parse(text);
}
function safeHtml(text) {
  return sanitize(text, { allowedTags: sanitize.defaults.allowedTags.concat(['img', 'h1', 'h2', 'table', 'thead', 'tbody', 'tr', 'th', 'td']),
    allowedAttributes: { '*': ['id'], a: ['href', 'name'], img: ['src', 'alt', 'width', 'height'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
    allowedSchemes: ['data'], allowedSchemesByTag: { a: ['http', 'https', 'mailto'], img: ['data'] }, allowProtocolRelative: false,
    transformTags: { img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, src: /^(?:https?:|file:|\/\/)/i.test(attribs.src || '') ? '' : attribs.src } }) } });
}
function htmlDocument(body) { return '<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,"PingFang SC",sans-serif}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:4px}img{max-width:100%}</style></head><body>' + body + '</body></html>'; }
async function command(executable, args, timeout = 120_000, extra = {}) {
  if (!executable) throw new Error('所需转换工具尚未安装鲸。');
  try { return await run(executable, args, { timeout, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024, ...extra }); }
  catch (error) { throw new Error(error.killed ? '转换超时，已停止鲸。' : '转换工具未能读取或生成有效文件鲸。文件可能损坏、加密或使用了不支持的编码。'); }
}
async function checkOutput(output) {
  const stat = await fs.stat(output);
  if (!stat.isFile() || !stat.size || stat.size > LIMIT) throw new Error('转换结果为空或超过 512 MB 鲸。');
  return output;
}
async function zipEntries(input) {
  return new Promise((resolve, reject) => {
    yauzl.open(input, { lazyEntries: true, autoClose: true }, (error, archive) => {
      if (error) return reject(new Error('ZIP 文件无法读取鲸。'));
      const entries = new Map(); let total = 0, count = 0, settled = false;
      const fail = () => { if (!settled) { settled = true; archive.close(); reject(new Error('压缩文件不安全、损坏或解压内容超过 256 MB 鲸。')); } };
      archive.on('error', fail);
      archive.on('entry', entry => {
        const name = entry.fileName;
        if (++count > 5000 || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..') || entries.has(name) ||
            ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000 || (entry.generalPurposeBitFlag & 1)) return fail();
        total += entry.uncompressedSize;
        if (total > 256 * 1024 * 1024 || entry.uncompressedSize > 100 * 1024 * 1024) return fail();
        if (name.endsWith('/')) return archive.readEntry();
        archive.openReadStream(entry, (error, stream) => {
          if (error) return fail();
          const buffers = []; let bytes = 0;
          stream.on('data', chunk => { bytes += chunk.length; if (bytes > entry.uncompressedSize) { stream.destroy(); fail(); } else buffers.push(chunk); });
          stream.on('error', fail);
          stream.on('end', () => { if (!settled) { entries.set(name, Buffer.concat(buffers)); archive.readEntry(); } });
        });
      });
      archive.on('end', () => { if (!settled) { settled = true; resolve(entries); } });
      archive.readEntry();
    });
  });
}
async function zipFiles(files, output) {
  const archive = new yazl.ZipFile();
  const stream = require('node:fs').createWriteStream(output, { flags: 'wx' });
  const done = new Promise((resolve, reject) => { stream.on('close', resolve); stream.on('error', reject); archive.outputStream.on('error', reject); });
  archive.outputStream.pipe(stream);
  for (const file of files) {
    if (file.bytes) archive.addBuffer(file.bytes, file.name, { compress: file.name !== 'mimetype' });
    else archive.addFile(file.path, file.name);
  }
  archive.end(); await done; await checkOutput(output); return output;
}
async function decodeText(input, encoding = 'auto') {
  const bytes = await fs.readFile(input);
  if (!['auto', 'utf-8', 'gb18030', 'utf-16le', 'utf-16be'].includes(encoding)) throw new Error('不支持的文字编码鲸。');
  let text;
  try {
    if (encoding !== 'auto') text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    else if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2));
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be', { fatal: true }).decode(bytes.subarray(2));
    else { try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { text = new TextDecoder('gb18030', { fatal: true }).decode(bytes); } }
    if (text.includes('\0')) throw new Error();
    return text.replace(/^\ufeff/, '');
  } catch { throw new Error('文本编码无法识别鲸。请检查文件或选择正确编码。'); }
}
module.exports = { fs, path, command, checkOutput, zipEntries, zipFiles, xml, escape, safeHtml, htmlDocument, decodeText };
