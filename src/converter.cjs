const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const { describeFormat, validateExtraInput, convertExtraInWorkspace } = require('./formats.cjs');

const full = require('./conversion-full.cjs');
const run = promisify(execFile);
const INSTALL_COMMAND = require('./platform-tools.cjs').installHint('libreoffice');
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
  const entries = await require('./conversion-utils.cjs').zipEntries(file);
  const stdout = entries.get('word/document.xml')?.toString('utf8') || '';
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
  try {
    if (format.category === 'document') await full.validate(realPath, format);
    if (!['document', 'pdf'].includes(format.category)) await validateExtraInput(realPath, format);
  } catch (error) {
    if (/[\u4e00-\u9fff]/.test(error.message)) throw error;
    throw new Error('文件无法识别鲸。内容可能损坏，或与扩展名不符。');
  }
  const pages = format.category === 'pdf' ? await require('./conversion-pdf.cjs').pageCount(realPath) : undefined;
  return { path: realPath, name: path.basename(realPath), ...format, ...(pages ? { pages } : {}) };
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
  const candidates = [...require('./platform-tools.cjs').candidates('soffice', 'SOFFICE_PATH'),
    ...(process.platform === 'darwin' ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice', path.join(os.homedir(), 'Applications/LibreOffice.app/Contents/MacOS/soffice')] : [])];
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
  const params = { ...options.params, originalPath: source.path, assetsName: encodeURIComponent(path.basename(destination) + '.assets') };
  const extension = full.extension(source, target, params);
  if (typeof destination !== 'string' || !path.isAbsolute(destination) ||
      path.extname(destination).toLowerCase() !== '.' + extension) {
    throw new Error('请为转换结果选择正确的文件扩展名鲸。');
  }
  const parent = await fs.realpath(path.dirname(destination));
  const outputPath = path.join(parent, path.basename(destination));
  if (outputPath === source.path) throw new Error('不能覆盖原文件鲸。');
  // Work in an isolated directory and publish results only after validation.
  const workspace = await makeWorkspace();
  try {
    const copy = path.join(workspace.dir, 'input' + path.extname(source.path).toLowerCase());
    await fs.copyFile(source.path, copy);
    if (['csv', 'tsv'].includes(source.ext)) {
      const text = await require('./conversion-utils.cjs').decodeText(copy, params.textEncoding);
      await fs.writeFile(copy, text, 'utf8');
    }
    let result;
    const tools = { ...options.tools, executable: soffice };
    let useLegacy = full.legacy(source, target, params);
    if (useLegacy && source.category === 'text') { try { await require('./formats.cjs').readText(copy); } catch { useLegacy = false; } }
    if (useLegacy) {
      if (source.category === 'document' || (source.category === 'presentation' && target === 'pdf')) {
        result = { output: await convertInWorkspace(soffice, copy, target, workspace), warnings: [] };
      } else if (source.category === 'pdf') {
        // Keep the established native PDF import; scan-only pages use OCR instead.
        const extracted = await require('./conversion-pdf.cjs').extractPages(copy, workspace, tools, params);
        result = extracted.warnings.length || tools.pdfSupported === false ? await full.convert(copy, target, workspace, source, tools, params) :
          { output: await convertInWorkspace(soffice, copy, target, workspace), warnings: [] };
      } else result = await convertExtraInWorkspace(copy, target, workspace, source, tools);
    } else result = await full.convert(copy, target, workspace, source, tools, params);
    const { output, warnings = [], attachments } = result;
    const stat = await fs.stat(output);
    if (!stat.isFile() || !stat.size) throw new Error('没有生成有效的转换文件鲸。');
    let assetsPath, assetsCreated = false;
    try {
      if (attachments) {
        assetsPath = outputPath + '.assets';
        await fs.mkdir(assetsPath); assetsCreated = true;
        for (const name of await fs.readdir(attachments)) await fs.copyFile(path.join(attachments, name), path.join(assetsPath, name), constants.COPYFILE_EXCL);
      }
      await fs.copyFile(output, outputPath, constants.COPYFILE_EXCL);
    } catch (error) {
      if (assetsCreated) await fs.rm(assetsPath, { recursive: true, force: true });
      if (error.code === 'EEXIST') throw new Error('这个名字的文件或附件文件夹已经存在鲸。请换个名字，避免覆盖。');
      throw new Error('结果无法保存鲸。请检查保存位置的权限和剩余空间。');
    }
    return options.details ? { path: outputPath, warnings, ...(attachments ? { attachments: assetsPath } : {}) } : outputPath;
  } catch (error) {
    if (/[\u4e00-\u9fff]/.test(error.message)) throw error;
    throw new Error('文件转换失败鲸。文件可能损坏、加密或使用了不支持的编码，请核对文件和所需工具。');
  } finally {
    await fs.rm(workspace.dir, { recursive: true, force: true });
  }
}

async function convertFiles(inputs, destination, soffice, options = {}) {
  if (!Array.isArray(inputs) || inputs.length < 2 || inputs.length > 100) throw new Error('一次支持 2–100 个文件鲸。');
  const sources = [];
  let bytes = 0;
  for (const input of inputs) {
    const source = await inspectInput(input); sources.push(source); bytes += (await fs.stat(source.path)).size;
  }
  if (bytes > 256 * 1024 * 1024) throw new Error('多文件总大小超过 256 MB 鲸。');
  if (sources.some(source => !source.targets.includes(options.target))) throw new Error('所选文件没有共同的转换目标鲸。');
  const merge = options.params?.combineMode === 'merge';
  if (merge && (options.target !== 'pdf' || !sources.every(source => source.category === 'pdf') && !sources.every(source => source.category === 'image'))) throw new Error('仅支持图片合并 PDF 或 PDF 合并鲸。');
  const ext = merge ? 'pdf' : 'zip';
  if (typeof destination !== 'string' || !path.isAbsolute(destination) || path.extname(destination).toLowerCase() !== '.' + ext) throw new Error('请使用正确的结果扩展名鲸。');
  const outputPath = path.join(await fs.realpath(path.dirname(destination)), path.basename(destination));
  if (sources.some(source => source.path === outputPath)) throw new Error('不能覆盖原文件鲸。');
  const workspace = await makeWorkspace();
  try {
    let result;
    if (merge) {
      const pdf = require('./conversion-pdf.cjs');
      result = sources[0].category === 'pdf' ? await pdf.mergePdf(sources, workspace) : await pdf.imagesPdf(sources, workspace, { ...options.tools, executable: soffice });
    } else {
      const files = [], warnings = [];
      for (const [index, source] of sources.entries()) {
        const dir = path.join(workspace.dir, 'batch-' + index); await fs.mkdir(dir);
        const name = String(index + 1).padStart(3, '0') + '-' + path.parse(source.name).name;
        const ext = full.extension(source, options.target, options.params);
        const output = path.join(dir, name + '.' + ext);
        const converted = await convertFile(source.path, output, soffice, { ...options, details: true });
        files.push({ name: path.basename(output), path: converted.path });
        if (converted.attachments) for (const file of await fs.readdir(converted.attachments)) files.push({ name: path.basename(converted.attachments) + '/' + file, path: path.join(converted.attachments, file) });
        warnings.push(...converted.warnings);
      }
      result = { output: await require('./conversion-utils.cjs').zipFiles(files, path.join(workspace.dir, 'batch.zip')), warnings: [sources.length + ' 个文件已分别转换并保存为 ZIP 鲸。', ...new Set(warnings)].slice(0, 12) };
    }
    await require('./conversion-utils.cjs').checkOutput(result.output);
    try { await fs.copyFile(result.output, outputPath, constants.COPYFILE_EXCL); }
    catch (error) { throw new Error(error.code === 'EEXIST' ? '结果文件已经存在鲸，请换个名字。' : '结果无法保存鲸，请检查权限和空间。'); }
    return { path: outputPath, warnings: result.warnings };
  } catch (error) {
    if (/[\u4e00-\u9fff]/.test(error.message)) throw error;
    throw new Error('多文件转换失败鲸。文件可能损坏、加密或使用了不支持的格式。');
  } finally { await fs.rm(workspace.dir, { recursive: true, force: true }); }
}

module.exports = { detectLibreOffice, inspectInput, convertFile, convertFiles, probePdf, wordXml, convertInWorkspace };
