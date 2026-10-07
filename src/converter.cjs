const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const { describeFormat, validateExtraInput, convertExtraInWorkspace } = require('./formats.cjs');

const run = promisify(execFile);
const INSTALL_COMMAND = 'brew install --cask libreoffice';
const TIMEOUT = 120_000;
const FILTERS = { pdf: 'pdf:writer_pdf_Export', docx: 'docx:Office Open XML Text' };

async function readHead(file, length = 8) {
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function wordXml(file) {
  const { stdout } = await run('/usr/bin/unzip', ['-p', file, 'word/document.xml'], {
    timeout: 10_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (!stdout.includes('<w:document')) throw new Error('无效的 Word 文档。');
  return stdout;
}

function documentText(xml) {
  // 只读 Word 的文字节点，排除绘图坐标和域代码。
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map(match => match[1]).join('').trim();
}

async function inspectInput(input) {
  if (typeof input !== 'string' || !path.isAbsolute(input)) {
    throw new Error('请从 Finder 拖入本机文件。');
  }
  let realPath;
  try {
    realPath = await fs.realpath(input);
    const stat = await fs.stat(realPath);
    if (!stat.isFile()) throw new Error();
    if (stat.size === 0) throw new Error();
    if (stat.size > 100 * 1024 * 1024) throw new Error('文件超过 100 MB，MVP 暂不支持鲸。');
  } catch (error) {
    if (error.message.includes('100 MB')) throw error;
    throw new Error('文件无法读取、为空或不是普通文件鲸。');
  }
  const ext = path.extname(realPath).toLowerCase();
  const format = describeFormat(ext);
  if (!format) throw new Error('目前只接收支持的文档、图片、音视频、表格、PPT 和文本格式鲸。');
  const head = await readHead(realPath);
  if (ext === '.pdf' && head.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('这个文件不是有效的 PDF 鲸。');
  }
  if (ext === '.docx') {
    try { await wordXml(realPath); } catch { throw new Error('这个文件不是有效的 .docx 鲸。'); }
  }
  if (ext === '.doc' && !head.equals(Buffer.from('d0cf11e0a1b11ae1', 'hex')) &&
      !head.toString().startsWith('{\\rtf')) {
    throw new Error('这个文件不是有效的 .doc 鲸。');
  }
  if (!['document', 'pdf'].includes(format.category)) await validateExtraInput(realPath, format);
  return { path: realPath, name: path.basename(realPath), ...format };
}

async function makeWorkspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cat-converter-'));
  const profile = path.join(dir, 'profile');
  await fs.mkdir(path.join(profile, 'user'), { recursive: true });
  // 每次使用独立配置，避免干扰已打开的 LibreOffice，并禁止文档宏执行。
  await fs.writeFile(path.join(profile, 'user', 'registrymodifications.xcu'),
    '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry">' +
    '<item oor:path="/org.openoffice.Office.Common/Security/Scripting">' +
    '<prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>' +
    '<item oor:path="/org.openoffice.Office.Writer/Content/Update">' +
    '<prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item></oor:items>');
  return { dir, profile };
}

async function convertInWorkspace(soffice, input, target, workspace) {
  const env = { ...process.env };
  if (process.platform === 'darwin' && !env.FONTCONFIG_FILE) {
    // macOS 无界面渲染可能只找到拉丁字体；显式加入本机字体，避免中文变成空白。
    const xmlEscape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const fontDirs = ['/System/Library/Fonts', '/Library/Fonts', path.join(os.homedir(), 'Library/Fonts'),
      path.resolve(path.dirname(soffice), '../Resources/fonts/truetype')];
    env.FONTCONFIG_FILE = path.join(workspace.dir, 'fonts.conf');
    await fs.writeFile(env.FONTCONFIG_FILE, '<?xml version="1.0"?><fontconfig>' +
      fontDirs.map(dir => '<dir>' + xmlEscape(dir) + '</dir>').join('') +
      '<cachedir>' + xmlEscape(path.join(workspace.dir, 'font-cache')) + '</cachedir></fontconfig>');
  }
  const args = [
    '-env:UserInstallation=' + pathToFileURL(workspace.profile).href,
    '--headless', '--nologo', '--nodefault', '--norestore',
    ...(target === 'docx' ? ['--infilter=writer_pdf_import'] : []),
    '--convert-to', target === 'pdf' && ['.ppt', '.pptx'].includes(path.extname(input)) ? 'pdf:impress_pdf_Export' : FILTERS[target], '--outdir', workspace.dir, input,
  ];
  try {
    await run(soffice, args, { env, timeout: TIMEOUT, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 });
  } catch (error) {
    if (error.killed) throw new Error('转换超过两分钟，已停止鲸。请换一个较小的文件重试。');
    throw new Error('LibreOffice 转换失败鲸。请检查文件是否损坏、加密，或需要密码。');
  }
  const output = path.join(workspace.dir, path.parse(input).name + '.' + target);
  try {
    const stat = await fs.stat(output);
    if (!stat.isFile() || stat.size === 0) throw new Error();
    if (target === 'pdf') {
      const head = await readHead(output);
      if (head.subarray(0, 5).toString() !== '%PDF-') throw new Error();
    } else {
      const text = documentText(await wordXml(output));
      // 缺少 PDF 导入组件时，LibreOffice 可能退回文本导入，把 PDF 二进制写成 DOCX。
      const header = Buffer.from('%PDF');
      const rawHeaders = ['%PDF-', header.toString('utf16le'), Buffer.from(header).swap16().toString('utf16le')];
      if (rawHeaders.some(raw => text.startsWith(raw))) throw new Error();
    }
  } catch {
    throw new Error('没有生成有效的转换文件鲸。PDF 可能被加密，或当前 LibreOffice 不支持此转换。');
  }
  return output;
}

// 一个有已知文字的单页 PDF，用实际转换结果检测 PDF 导入能力。
function probePdf() {
  const content = 'BT /F1 18 Tf 48 750 Td (CAT_PDF_IMPORT_CHECK) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

async function detectLibreOffice() {
  const candidates = [
    process.env.SOFFICE_PATH,
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    path.join(os.homedir(), 'Applications/LibreOffice.app/Contents/MacOS/soffice'),
    ...(process.env.PATH || '').split(path.delimiter)
      .filter(dir => dir && !dir.includes('codex-runtimes'))
      .map(dir => path.join(dir, 'soffice')),
  ].filter(Boolean);
  for (const executable of new Set(candidates)) {
    if (!path.isAbsolute(executable)) continue;
    let version;
    try {
      await fs.access(executable, constants.X_OK);
      const { stdout } = await run(executable, ['--version'], { timeout: 10_000 });
      if (!stdout.startsWith('LibreOffice')) continue;
      version = stdout.trim().split('\n')[0];
    } catch { continue; }
    const workspace = await makeWorkspace();
    let pdfSupported = false;
    try {
      const input = path.join(workspace.dir, 'probe.pdf');
      await fs.writeFile(input, probePdf());
      const output = await convertInWorkspace(executable, input, 'docx', workspace);
      const xml = await wordXml(output);
      // 必须只得到样例文字；原始 PDF 源码里也包含标记，includes 会造成误判。
      // DOCX 可同时保存形状和备用文本，因此同一文字可能出现两次。
      pdfSupported = /^(?:CAT_PDF_IMPORT_CHECK)+$/.test(documentText(xml).replace(/\s/g, ''));
    } catch { /* 正向转换仍可用，界面明确提示反向能力检测未通过。 */ }
    finally { await fs.rm(workspace.dir, { recursive: true, force: true }); }
    return { available: true, executable, version, pdfSupported, installCommand: INSTALL_COMMAND };
  }
  return { available: false, pdfSupported: false, installCommand: INSTALL_COMMAND };
}

async function convertFile(input, destination, soffice, options = {}) {
  const source = await inspectInput(input);
  const target = options.target || source.target;
  if (!source.targets.includes(target)) throw new Error('不支持这个转换目标鲸。');
  const extension = source.category === 'presentation' && target !== 'pdf' ? 'zip' : target;
  if (typeof destination !== 'string' || !path.isAbsolute(destination) ||
      path.extname(destination).toLowerCase() !== '.' + extension) {
    throw new Error('请为转换结果选择正确的文件扩展名鲸。');
  }
  const parent = await fs.realpath(path.dirname(destination));
  const outputPath = path.join(parent, path.basename(destination));
  if (outputPath === source.path) throw new Error('不能覆盖原文件鲸。');
  // ponytail: MVP 每次只转换一个文件，暂不实现批量队列。
  const workspace = await makeWorkspace();
  try {
    const copy = path.join(workspace.dir, 'input' + path.extname(source.path).toLowerCase());
    await fs.copyFile(source.path, copy);
    let output, warnings = [];
    if (['document', 'pdf'].includes(source.category) || (source.category === 'presentation' && target === 'pdf')) {
      output = await convertInWorkspace(soffice, copy, target, workspace);
    } else {
      ({ output, warnings } = await convertExtraInWorkspace(copy, target, workspace, source, { ...options.tools, executable: soffice }));
    }
    const stat = await fs.stat(output);
    if (!stat.isFile() || !stat.size) throw new Error('没有生成有效的转换文件鲸。');
    try {
      await fs.copyFile(output, outputPath, constants.COPYFILE_EXCL);
    } catch (error) {
      if (error.code === 'EEXIST') throw new Error('这个名字的文件已经存在鲸。请换个名字，避免覆盖。');
      throw new Error('结果无法保存鲸。请检查保存位置的权限和剩余空间。');
    }
    return options.details ? { path: outputPath, warnings } : outputPath;
  } finally {
    await fs.rm(workspace.dir, { recursive: true, force: true });
  }
}

module.exports = { detectLibreOffice, inspectInput, convertFile, probePdf, wordXml, convertInWorkspace };
