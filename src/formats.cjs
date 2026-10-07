const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const sharp = require('sharp');
const ExcelJS = require('exceljs');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const run = promisify(execFile);
const audioFormats = ['mp3', 'wav', 'flac', 'aac', 'm4a'];
const MAX_PIXELS = 40_000_000;
const MAX_ROWS = 100_000;
const MAX_CELLS = 1_000_000;
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
const labels = { pdf: 'PDF 文档', docx: 'Word 文档', jpg: 'JPG 图片', png: 'PNG 图片', webp: 'WebP 图片',
  mp3: 'MP3 音频', wav: 'WAV 音频', flac: 'FLAC 音频', aac: 'AAC 音频', m4a: 'M4A 音频',
  mp4: 'MP4 视频', gif: 'GIF 动图', xlsx: 'Excel 表格', csv: 'CSV 表格', tsv: 'TSV 表格', txt: '纯文本', md: 'Markdown 文本' };

function describeFormat(ext) {
  ext = ext.toLowerCase().replace(/^\./, '');
  let category, targets;
  if (['doc', 'docx'].includes(ext)) { category = 'document'; targets = ['pdf']; }
  else if (ext === 'pdf') { category = 'pdf'; targets = ['docx']; }
  else if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)) { category = 'image'; targets = ['jpg', 'png', 'webp']; }
  else if (audioFormats.includes(ext)) { category = 'audio'; targets = audioFormats; }
  else if (['mp4', 'mov', 'mkv', 'webm'].includes(ext)) { category = 'video'; targets = ['mp4', 'mp3', 'wav', 'gif']; }
  else if (['xls', 'xlsx', 'csv', 'tsv'].includes(ext)) { category = 'spreadsheet'; targets = ['xlsx', 'csv', 'tsv']; }
  else if (['ppt', 'pptx'].includes(ext)) { category = 'presentation'; targets = ['pdf', 'jpg', 'png']; }
  else if (['txt', 'md', 'markdown'].includes(ext)) { category = 'text'; targets = ['txt', 'md']; }
  else return null;
  targets = targets.filter(target => target !== (ext === 'jpeg' ? 'jpg' : ext === 'markdown' ? 'md' : ext));
  return { ext, category, targets, target: targets[0] };
}

function formatOptions(source, tools) {
  return source.targets.map(target => {
    const archive = source.category === 'presentation' && target !== 'pdf';
    let enabled = true, reason = '', installCommand = '', note = '';
    const needsOffice = ['document', 'pdf', 'presentation'].includes(source.category) || source.ext === 'xls';
    if (needsOffice && !tools.available) {
      enabled = false; reason = '未找到 LibreOffice'; installCommand = 'brew install --cask libreoffice';
    } else if (source.category === 'pdf' && !tools.pdfSupported) {
      enabled = false; reason = 'LibreOffice 未通过 PDF 导入检测'; installCommand = 'brew install --cask libreoffice';
    } else if (['audio', 'video'].includes(source.category) && !tools.ffmpeg) {
      enabled = false; reason = '未找到 FFmpeg / ffprobe'; installCommand = 'brew install ffmpeg';
    } else if (archive && !tools.poppler) {
      enabled = false; reason = '未找到 Poppler'; installCommand = 'brew install poppler';
    }
    if (source.category === 'pdf') note = '实验功能：排版可能变化；扫描件不会识别为可编辑文字。';
    if (source.category === 'spreadsheet' && ['csv', 'tsv'].includes(target)) note = '仅导出第一张工作表的值，不保留公式和样式。';
    if (archive) note = '每页一张图片，按顺序保存为 ZIP。';
    if (target === 'gif') note = '宽度不超过 720 像素，12 帧/秒，无声音。';
    if (source.category === 'text') note = target === 'txt' ? '去除 Markdown 排版标记，保留可读文字。' : '保留文字，不自动生成标题或排版。';
    return { target, label: labels[target], extension: archive ? 'zip' : target, enabled, reason, installCommand, note };
  });
}

async function findExecutable(name, envName, versionArgs) {
  // Finder 启动时 PATH 可能没有 Homebrew；不依赖 Codex 的临时工具路径。
  const candidates = [process.env[envName], path.join('/opt/homebrew/bin', name), path.join('/usr/local/bin', name),
    ...(process.env.PATH || '').split(path.delimiter).filter(dir => dir && !dir.includes('codex-runtimes'))
      .map(dir => path.join(dir, name))].filter(candidate => candidate && path.isAbsolute(candidate));
  for (const candidate of new Set(candidates)) {
    try {
      await fs.access(candidate, constants.X_OK);
      await run(candidate, versionArgs, { timeout: 10_000, maxBuffer: 1024 * 1024 });
      return candidate;
    } catch { /* 尝试下一个正式安装路径。 */ }
  }
}

async function detectExtraTools() {
  const [ffmpegPath, ffprobePath, pdftoppmPath] = await Promise.all([
    findExecutable('ffmpeg', 'FFMPEG_PATH', ['-version']),
    findExecutable('ffprobe', 'FFPROBE_PATH', ['-version']),
    findExecutable('pdftoppm', 'PDFTOPPM_PATH', ['-v']),
  ]);
  return { ffmpegPath, ffprobePath, pdftoppmPath, ffmpeg: Boolean(ffmpegPath && ffprobePath), poppler: Boolean(pdftoppmPath) };
}

async function readText(input) {
  const bytes = await fs.readFile(input);
  try {
    let text;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2));
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be', { fatal: true }).decode(bytes.subarray(2));
    else text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error();
    return text;
  } catch { throw new Error('文本编码无法识别鲸。请先另存为 UTF-8 或带 BOM 的 UTF-16。'); }
}

async function probeMedia(input, tools) {
  if (!tools.ffprobePath) throw new Error('未找到 ffprobe，请运行 brew install ffmpeg 后重新检查鲸。');
  try {
    const { stdout } = await run(tools.ffprobePath, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', input],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch { throw new Error('音视频无法读取鲸。文件可能损坏、加密，或使用了不支持的编码。'); }
}

async function validateExtraInput(input, source) {
  if (source.category === 'image') {
    try {
      if (['heic', 'heif'].includes(source.ext)) {
        const { stdout } = await run('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', input], { timeout: 30_000 });
        const w = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1]);
        const h = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1]);
        if (!(w > 0 && h > 0 && w * h <= MAX_PIXELS)) throw new Error();
      } else {
        const info = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
        const expected = source.ext === 'jpg' ? 'jpeg' : source.ext;
        if (info.format !== expected || !info.width || !info.height) throw new Error();
      }
    } catch { throw new Error('图片无效或超过 4000 万像素鲸。请检查文件后重试。'); }
  } else if (['audio', 'video'].includes(source.category)) {
    const head = Buffer.alloc(12);
    const handle = await fs.open(input, 'r');
    try { await handle.read(head, 0, 12, 0); } finally { await handle.close(); }
    const valid = head.toString('ascii', 0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) ||
      (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WAVE') ||
      head.toString('ascii', 0, 4) === 'fLaC' || head.toString('ascii', 4, 8) === 'ftyp' || head.readUInt32BE(0) === 0x1a45dfa3;
    if (!valid) throw new Error('这个文件不是有效的音视频鲸。请检查文件内容。');
    const tools = await detectExtraTools();
    if (tools.ffmpeg) {
      const info = await probeMedia(input, tools);
      if (!info.streams?.some(stream => stream.codec_type === source.category)) throw new Error('文件中没有对应的音频或视频轨道鲸。');
    }
  } else if (source.ext === 'pptx' || source.ext === 'xlsx') {
    const entry = source.ext === 'pptx' ? 'ppt/presentation.xml' : 'xl/workbook.xml';
    try {
      const listing = await run('/usr/bin/unzip', ['-l', input], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
      const inflated = Number(listing.stdout.match(/\n\s*(\d+)\s+\d+ files?\s*$/)?.[1]);
      if (!Number.isFinite(inflated) || inflated > 256 * 1024 * 1024) throw new Error();
      const { stdout } = await run('/usr/bin/unzip', ['-p', input, entry], { timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
      if (!stdout.includes(source.ext === 'pptx' ? 'presentation' : 'workbook')) throw new Error();
    } catch { throw new Error('Office 文件无效或解压内容超过 256 MB 鲸。'); }
  } else if (['xls', 'ppt'].includes(source.ext)) {
    const handle = await fs.open(input, 'r');
    const head = Buffer.alloc(8);
    try { await handle.read(head, 0, 8, 0); } finally { await handle.close(); }
    if (!head.equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))) throw new Error('这个文件不是有效的旧版 Office 文件鲸。');
  } else if (source.category === 'text' || ['csv', 'tsv'].includes(source.ext)) {
    await readText(input);
  }
}

async function convertImage(input, target, workspace, source) {
  let prepared = input;
  if (['heic', 'heif'].includes(source.ext)) {
    prepared = path.join(workspace.dir, 'decoded.png');
    try { await run('/usr/bin/sips', ['-s', 'format', 'png', input, '--out', prepared], { timeout: 120_000 }); }
    catch { throw new Error('HEIC 图片解码失败鲸。请检查文件是否损坏。'); }
  }
  const metadata = await sharp(prepared, { animated: true, limitInputPixels: MAX_PIXELS }).metadata();
  const warnings = [];
  const output = path.join(workspace.dir, 'result.' + target);
  let image = sharp(prepared, { animated: target === 'webp', limitInputPixels: MAX_PIXELS }).rotate();
  if ((metadata.pages || 1) > 1 && target !== 'webp') warnings.push('动画图片只保留第一帧鲸。');
  if (target === 'jpg' && metadata.hasAlpha) {
    image = image.flatten({ background: '#ffffff' });
    warnings.push('JPG 不支持透明，透明区域已填充为白色鲸。');
  }
  await image.toFormat(target === 'jpg' ? 'jpeg' : target, ['jpg', 'webp'].includes(target) ? { quality: 90 } : {}).toFile(output);
  const check = await sharp(output, { animated: true, limitInputPixels: MAX_PIXELS }).metadata();
  if (!check.width || !check.height || ((metadata.pages || 1) > 1 && target === 'webp' && check.pages !== metadata.pages)) {
    throw new Error('没有生成完整有效的图片鲸。');
  }
  return { output, warnings };
}

async function convertMedia(input, target, workspace, source, tools) {
  const info = await probeMedia(input, tools);
  const streams = info.streams || [];
  const isAudio = audioFormats.includes(target);
  const kind = isAudio ? 'audio' : 'video';
  if (!streams.some(stream => stream.codec_type === kind)) throw new Error(isAudio ? '这个文件没有音频轨道，无法提取声音鲸。' : '这个文件没有视频轨道鲸。');
  const output = path.join(workspace.dir, 'result.' + target);
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-protocol_whitelist', 'file,pipe', '-i', input];
  const codecs = { mp3: ['-c:a', 'libmp3lame', '-q:a', '2'], wav: ['-c:a', 'pcm_s16le'], flac: ['-c:a', 'flac'],
    aac: ['-c:a', 'aac', '-b:a', '192k'], m4a: ['-c:a', 'aac', '-b:a', '192k'] };
  const warnings = [];
  if (isAudio) args.push('-map', '0:a:0', '-vn', ...codecs[target]);
  else if (target === 'mp4') {
    args.push('-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart');
    if (streams.some(stream => stream.codec_type === 'video' && /rgba|argb|bgra|abgr|yuva/.test(stream.pix_fmt || '') || stream.tags?.alpha_mode === '1')) {
      warnings.push('MP4 不保留透明背景鲸。');
    }
  } else {
    args.push('-map', '0:v:0', '-an', '-vf', "fps=12,scale='min(720,iw)':-2:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", '-loop', '0');
    warnings.push('GIF 无声音，宽度不超过 720 像素、12 帧/秒鲸。');
  }
  args.push('-fs', String(MAX_OUTPUT_BYTES), output);
  try { await run(tools.ffmpegPath, args, { timeout: 30 * 60_000, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024 }); }
  catch (error) { throw new Error(error.killed ? '音视频转换超过 30 分钟，已停止鲸。' : '音视频转换失败鲸。请检查文件编码和剩余空间。'); }
  const result = await probeMedia(output, tools);
  if ((await fs.stat(output)).size >= MAX_OUTPUT_BYTES) throw new Error('音视频结果超过 512 MB，已停止并清理鲸。');
  if (!result.streams?.some(stream => stream.codec_type === kind)) throw new Error('没有生成有效的音视频鲸。');
  const before = Number(info.format?.duration || streams.find(stream => stream.codec_type === kind)?.duration);
  const after = Number(result.format?.duration || result.streams.find(stream => stream.codec_type === kind)?.duration);
  if (before > 0 && (!(after > 0) || Math.abs(before - after) > Math.max(1, before * .02))) throw new Error('转换结果时长不完整鲸。');
  return { output, warnings };
}

function parseTable(text, ext) {
  let rows;
  try { rows = parse(text, { bom: true, delimiter: ext === 'tsv' ? '\t' : ',', skip_empty_lines: true, max_record_size: 1024 * 1024 }); }
  catch { throw new Error('表格文本格式不正确鲸。请检查列数、分隔符和引号。'); }
  if (!rows.length || rows.length > MAX_ROWS || rows.reduce((sum, row) => sum + row.length, 0) > MAX_CELLS) {
    throw new Error('表格为空或超过 10 万行／100 万单元格鲸。');
  }
  return rows;
}

async function convertSpreadsheet(input, target, workspace, source, tools) {
  const warnings = [];
  let prepared = input;
  if (source.ext === 'xls') {
    prepared = path.join(workspace.dir, 'input.xlsx');
    try {
      await run(tools.executable, ['-env:UserInstallation=' + pathToFileURL(workspace.profile).href, '--headless', '--norestore',
        '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', workspace.dir, input], { timeout: 120_000, killSignal: 'SIGKILL' });
    } catch { throw new Error('旧版 Excel 转换失败鲸。请检查是否损坏或加密。'); }
  }
  const output = path.join(workspace.dir, 'result.' + target);
  const workbook = new ExcelJS.Workbook();
  let rows;
  if (['csv', 'tsv'].includes(source.ext)) {
    rows = parseTable(await readText(input), source.ext);
  } else {
    try { await workbook.xlsx.readFile(prepared); }
    catch { throw new Error('Excel 表格无法读取鲸。请检查是否损坏、加密或不兼容。'); }
    const sheet = workbook.worksheets[0];
    if (!sheet || !sheet.rowCount || sheet.rowCount > MAX_ROWS || sheet.rowCount * sheet.columnCount > MAX_CELLS) throw new Error('工作表为空或超过 10 万行／100 万单元格鲸。');
    if (target === 'xlsx') rows = null;
    else {
      rows = [];
      for (let r = 1; r <= sheet.rowCount; r++) {
        const row = [];
        for (let c = 1; c <= sheet.columnCount; c++) {
          const cell = sheet.getCell(r, c);
          if (cell.type === ExcelJS.ValueType.Formula && cell.result === undefined) throw new Error('表格含没有已保存计算结果的公式鲸。请用 Excel 计算并保存后重试。');
          const value = cell.type === ExcelJS.ValueType.Formula ? cell.result : cell.value;
          row.push(value instanceof Date ? value.toISOString() : value && typeof value === 'object'
            ? value.error || (value.richText ? value.richText.map(part => part.text).join('') : value.text || '') : value ?? '');
        }
        rows.push(row);
      }
      warnings.push(`已导出第一张工作表“${sheet.name}”，不保留公式和样式鲸。`);
      if (workbook.worksheets.length > 1) warnings.push(`其余 ${workbook.worksheets.length - 1} 张工作表未导出鲸。`);
    }
  }
  if (target === 'xlsx') {
    if (rows) {
      workbook.addWorksheet('Sheet1').addRows(rows);
      await workbook.xlsx.writeFile(output);
    } else {
      // 旧 XLS 已由 LibreOffice 转成 XLSX，直接保存，避免再编码丢失图表等内容。
      await fs.copyFile(prepared, output);
    }
    const verify = new ExcelJS.Workbook();
    await verify.xlsx.readFile(output);
    if (!verify.worksheets.length) throw new Error('没有生成有效的 Excel 表格鲸。');
  } else {
    await fs.writeFile(output, stringify(rows, { bom: true, delimiter: target === 'tsv' ? '\t' : ',', record_delimiter: '\r\n' }), 'utf8');
    const verify = parseTable(await readText(output), target);
    if (verify.length !== rows.length) throw new Error('表格导出行数不完整鲸。');
  }
  return { output, warnings };
}

async function markdownText(markdown) {
  const { marked } = await import('marked');
  function inline(tokens = []) {
    return tokens.map(token => {
      if (token.type === 'image') return token.text || '';
      if (token.type === 'br') return '\n';
      if (token.type === 'html') return token.raw.replace(/<[^>]*>/g, '');
      return token.tokens ? inline(token.tokens) : token.text || '';
    }).join('');
  }
  function blocks(tokens) {
    return tokens.map(token => {
      if (token.type === 'space' || token.type === 'def' || token.type === 'hr') return '';
      if (token.type === 'list') return token.items.map((item, i) => (token.ordered ? `${token.start + i}. ` : '• ') + blocks(item.tokens)).join('\n');
      if (token.type === 'blockquote') return blocks(token.tokens);
      if (token.type === 'table') return [token.header, ...token.rows].map(row => row.map(cell => inline(cell.tokens)).join('\t')).join('\n');
      if (token.type === 'code') return token.text;
      if (token.type === 'html') return token.raw.replace(/<[^>]*>/g, '');
      return inline(token.tokens || [token]);
    }).filter(Boolean).join('\n\n');
  }
  return blocks(marked.lexer(markdown)) + '\n';
}

async function convertText(input, target, workspace) {
  const text = await readText(input);
  const output = path.join(workspace.dir, 'result.' + target);
  const converted = target === 'txt' ? await markdownText(text) : text;
  if (!converted.trim()) throw new Error('文本没有可转换的内容鲸。');
  await fs.writeFile(output, converted, 'utf8');
  await readText(output);
  return { output, warnings: target === 'md' ? ['文字原样保留，未自动生成标题或排版鲸。'] : [] };
}

async function convertSlides(input, target, workspace, tools) {
  const pdf = await require('./converter.cjs').convertInWorkspace(tools.executable, input, 'pdf', workspace);
  const { stdout } = await run(path.join(path.dirname(tools.pdftoppmPath), 'pdfinfo'), [pdf], { timeout: 30_000, env: { ...process.env, LC_ALL: 'C' } });
  const pages = Number(stdout.match(/^Pages:\s*(\d+)/m)?.[1]);
  if (!pages || pages > 200) throw new Error('演示文稿图片导出最多支持 200 页鲸。');
  const folder = path.join(workspace.dir, 'slides');
  await fs.mkdir(folder);
  const prefix = path.join(folder, 'page');
  try { await run(tools.pdftoppmPath, [target === 'jpg' ? '-jpeg' : '-png', '-r', '120', '-scale-to', '2048', pdf, prefix],
    { timeout: 120_000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 }); }
  catch { throw new Error('幻灯片图片导出失败或超过两分钟鲸。请换一个较小的文件。'); }
  const files = (await fs.readdir(folder)).filter(name => name.endsWith('.' + target));
  if (files.length !== pages) throw new Error('幻灯片图片页数不完整鲸。');
  for (const name of files) {
    const info = await sharp(path.join(folder, name), { limitInputPixels: MAX_PIXELS }).metadata();
    if (!info.width || !info.height) throw new Error('幻灯片图片不完整鲸。');
  }
  const output = path.join(workspace.dir, 'result.zip');
  await run('/usr/bin/ditto', ['--norsrc', '-c', '-k', '--keepParent', folder, output], { timeout: 120_000 });
  await run('/usr/bin/unzip', ['-t', output], { timeout: 30_000, maxBuffer: 1024 * 1024 });
  if ((await fs.stat(output)).size > MAX_OUTPUT_BYTES) throw new Error('幻灯片图片结果超过 512 MB 鲸。');
  return { output, warnings: [`已按页码保存 ${files.length} 张图片为 ZIP 鲸。`] };
}

async function convertExtraInWorkspace(input, target, workspace, source, tools) {
  try {
    if (source.category === 'image') return await convertImage(input, target, workspace, source);
    if (['audio', 'video'].includes(source.category)) return await convertMedia(input, target, workspace, source, tools);
    if (source.category === 'spreadsheet') return await convertSpreadsheet(input, target, workspace, source, tools);
    if (source.category === 'text') return await convertText(input, target, workspace);
    if (source.category === 'presentation') return await convertSlides(input, target, workspace, tools);
    throw new Error('不支持这个转换目标鲸。');
  } catch (error) {
    if (/[\u4e00-\u9fff]/.test(error.message)) throw error;
    throw new Error('转换失败鲸。文件可能损坏、内容过大或无法写入，请检查后重试。');
  }
}

module.exports = { describeFormat, formatOptions, detectExtraTools, validateExtraInput, convertExtraInWorkspace,
  readText, parseTable, markdownText, probeMedia };
