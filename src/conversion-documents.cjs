const os = require('node:os');
const { pathToFileURL } = require('node:url');
const mammoth = require('mammoth');
const Turndown = require('turndown');
const { gfm } = require('turndown-plugin-gfm');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const yaml = require('js-yaml');
const { fs, path, command, checkOutput, zipEntries, zipFiles, xml, escape, safeHtml, htmlDocument, decodeText } = require('./conversion-utils.cjs');
const turndown = new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
turndown.use(gfm);
// Mammoth tables often have no explicit TH row. Preserve every cell, including a headerless first row.
turndown.addRule('documentTable', { filter: 'table', replacement: (_, node) => {
  const rows = Array.from(node.querySelectorAll('tr')).map(row => Array.from(row.querySelectorAll('th,td')).map(cell => turndown.turndown(cell.innerHTML).replaceAll('|', '\\|').replace(/\n/g, '<br>')));
  const columns = Math.max(0, ...rows.map(row => row.length)); if (!columns) return '';
  const line = row => '| ' + Array.from({ length: columns }, (_, i) => row[i] || '').join(' | ') + ' |';
  return '\n\n' + [line(rows[0]), line(Array(columns).fill('---')), ...rows.slice(1).map(line)].join('\n') + '\n\n';
} });
async function office(input, target, workspace, source, tools) {
  const dir = path.join(workspace.dir, 'office-' + target); await fs.mkdir(dir, { recursive: true });
  const filters = { docx: 'docx:Office Open XML Text', odt: 'odt:writer8', rtf: 'rtf:Rich Text Format', txt: 'txt:Text (encoded):UTF8',
    xlsx: 'xlsx:Calc Office Open XML', xls: 'xls:MS Excel 97', ods: 'ods:calc8', csv: 'csv:Text - txt - csv (StarCalc):44,34,76,1',
    pptx: 'pptx:Impress Office Open XML', odp: 'odp:impress8', pdf: 'pdf:' + (source.category === 'spreadsheet' ? 'calc_pdf_Export' : source.category === 'presentation' ? 'impress_pdf_Export' : 'writer_pdf_Export') };
  const env = { ...process.env };
  if (process.platform === 'darwin') {
    env.FONTCONFIG_FILE = path.join(workspace.dir, 'full-fonts.conf');
    const dirs = ['/System/Library/Fonts', '/Library/Fonts', path.join(os.homedir(), 'Library/Fonts'), path.resolve(path.dirname(tools.executable || ''), '../Resources/fonts/truetype')];
    await fs.writeFile(env.FONTCONFIG_FILE, '<?xml version="1.0"?><fontconfig>' + dirs.map(d => '<dir>' + escape(d) + '</dir>').join('') + '<cachedir>' + escape(path.join(workspace.dir, 'font-cache')) + '</cachedir></fontconfig>');
  }
  await command(tools.executable, ['-env:UserInstallation=' + pathToFileURL(workspace.profile).href, '--headless', '--nologo', '--nodefault', '--norestore',
    '--convert-to', filters[target] || target, '--outdir', dir, input], 120_000, { env });
  const output = path.join(dir, path.parse(input).name + '.' + target); await checkOutput(output);
  if (target === 'pdf' && !(await fs.readFile(output)).subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('没有生成有效 PDF 鲸。');
  if (['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'].includes(target)) {
    const entries = await zipEntries(output);
    const required = { docx: 'word/document.xml', xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml', odt: 'content.xml', ods: 'content.xml', odp: 'content.xml' }[target];
    if (!entries.has(required)) throw new Error('没有生成有效 Office 文件鲸。');
  }
  if (target === 'html' && source.category === 'spreadsheet') {
    const html = await inlineLocalImages(await fs.readFile(output, 'utf8'), output);
    await fs.writeFile(output, htmlDocument(html));
  }
  let warnings = ['文档排版、字体及复杂对象可能变化鲸。'];
  if (source.category === 'spreadsheet' && target === 'csv') warnings = ['仅导出第一张工作表的值，不保留公式和样式鲸。'];
  return { output, warnings };
}
async function docxHtml(input, workspace, params = {}) {
  const assets = path.join(workspace.dir, 'attachments'); await fs.mkdir(assets, { recursive: true });
  let count = 0;
  const entries = await zipEntries(input);
  const styles = entries.get('word/styles.xml')?.toString('utf8') || '';
  const styleMap = [];
  for (const match of styles.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[\s\S]*?<\/w:style>/g)) {
    const name = match[0].match(/<w:name\b[^>]*w:val="([^"]+)"/)?.[1];
    const level = match[0].match(/<w:outlineLvl\b[^>]*w:val="([0-8])"/)?.[1];
    const heading = name?.match(/(?:heading\s*|标题\s*)([1-6])/i)?.[1] || (level !== undefined ? Number(level) + 1 : null);
    if (heading && heading <= 6 && name && !name.includes("'")) styleMap.push("p[style-name='" + name + "'] => h" + heading + ':fresh');
  }
  const result = await mammoth.convertToHtml({ path: input }, { styleMap, externalFileAccess: false, convertImage: mammoth.images.imgElement(async image => {
    const bytes = await image.read();
    if (bytes.length > 20 * 1024 * 1024) throw new Error('Word 图片附件过大鲸。');
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[image.contentType];
    if (!ext) throw new Error('Word 中有无法导出的图片类型鲸。请先转换成 PNG/JPG。');
    if (params.inlineImages) return { src: 'data:' + image.contentType + ';base64,' + bytes.toString('base64') };
    const name = 'image-' + ++count + '.' + ext; await fs.writeFile(path.join(assets, name), bytes);
    return { src: (params.assetsName || 'attachments') + '/' + name };
  }) });
  return { html: safeHtml(result.value), attachments: count ? assets : undefined,
    warnings: result.messages.map(message => 'Word 提示：' + message.message).slice(0, 8) };
}
async function document(input, target, workspace, source, tools, params) {
  if (source.ext === 'ofd') {
    const entries = await zipEntries(input);
    for (const [name, bytes] of entries) if (/\.xml$/i.test(name)) xml(bytes.toString('utf8'));
    if (!entries.has('OFD.xml')) throw new Error('无效 OFD 文件鲸。');
    const fontDir = path.join(__dirname, '..', 'assets', 'conversion-fonts');
    await fs.access(path.join(fontDir, 'NotoSansCJKsc-Regular.otf')).catch(() => { throw new Error('OFD 中文字体未安装鲸，请按转换说明补齐 Noto Sans SC。'); });
    const output = path.join(workspace.dir, 'result.pdf');
    // The dependency caches fontkit registration globally; isolate each conversion in a child process.
    const worker = path.join(__dirname, 'ofd-worker.cjs');
    await command(process.execPath, [worker, input, output, fontDir], 120_000, { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    await checkOutput(output);
    return { output, warnings: ['OFD 转换为实验功能，签章、特殊字体与复杂路径可能变化鲸。'] };
  }
  if (['md', 'txt', 'html'].includes(target)) {
    let docx = input;
    if (source.ext !== 'docx') docx = (await office(input, 'docx', workspace, source, tools)).output;
    if (target === 'md' && tools.pandocPath) {
      const output = path.join(workspace.dir, 'result.md');
      const extracted = path.join(workspace.dir, 'word-media');
      await command(tools.pandocPath, ['-f', 'docx', '-t', 'gfm-raw_html+tex_math_dollars-tex_math_gfm', '--extract-media=word-media', docx, '-o', output], 120_000, { cwd: workspace.dir });
      let markdown = await fs.readFile(output, 'utf8');
      const assets = path.join(workspace.dir, 'attachments'); await fs.mkdir(assets, { recursive: true });
      let count = 0;
      async function collect(dir) {
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
          const file = path.join(dir, entry.name);
          if (entry.isDirectory()) await collect(file);
          else if (entry.isFile()) {
            const name = 'image-' + ++count + path.extname(entry.name);
            await fs.copyFile(file, path.join(assets, name));
            const relative = path.relative(workspace.dir, file).split(path.sep).join('/');
            markdown = markdown.replaceAll(relative, (params.assetsName || 'attachments') + '/' + name);
          } else throw new Error('文档图片附件无效鲸。');
        }
      }
      await fs.access(extracted).then(() => collect(extracted), () => {});
      await fs.writeFile(output, markdown);
      return { output, attachments: count ? assets : undefined, warnings: ['保留标题、表格、代码、公式与图片附件；复杂版式可能变化鲸。'] };
    }
    const result = await docxHtml(docx, workspace, { ...params, inlineImages: target === 'html' });
    const output = path.join(workspace.dir, 'result.' + target);
    const body = target === 'md' ? turndown.turndown(result.html) : target === 'html' ? htmlDocument(result.html) : turndown.turndown(result.html);
    const text = target === 'txt' ? await require('./formats.cjs').markdownText(body) : body;
    if (!text.trim()) throw new Error('文档中没有可导出的文字鲸。');
    await fs.writeFile(output, text, 'utf8');
    return { output, attachments: target === 'md' ? result.attachments : undefined, warnings: [...result.warnings, '保留标题、段落和简单表格；复杂布局、分页及公式可能变化鲸。'] };
  }
  return office(input, target, workspace, source, tools);
}
async function inlineLocalImages(html, sourcePath) {
  const root = await fs.realpath(path.dirname(sourcePath));
  const matches = [...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)];
  for (const match of matches) {
    const src = match[1];
    if (/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(src)) continue;
    if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(src)) throw new Error('转换仅读取本机图片，不下载远程图片鲸。请先保存到文档旁边。');
    const candidate = await fs.realpath(path.resolve(root, decodeURIComponent(src))).catch(() => { throw new Error('文档引用的图片不存在鲸。'); });
    if (!candidate.startsWith(root + path.sep)) throw new Error('图片路径超出了文档所在文件夹鲸。');
    const bytes = await fs.readFile(candidate); if (bytes.length > 20 * 1024 * 1024) throw new Error('图片附件过大鲸。');
    const info = await require('sharp')(bytes, { limitInputPixels: 40_000_000 }).metadata();
    const mime = { png: 'png', jpeg: 'jpeg', gif: 'gif', webp: 'webp' }[info.format];
    if (!mime) throw new Error('本地图片需使用 PNG、JPG、GIF 或 WebP 鲸。');
    html = html.replace(match[0], match[0].replace(src, 'data:image/' + mime + ';base64,' + bytes.toString('base64')));
  }
  return safeHtml(html);
}
async function ebook(input, source, workspace) {
  if (source.ext === 'mobi') {
    const { initMobiFile } = await import('@lingo-reader/mobi-parser');
    const assets = path.join(workspace.dir, 'mobi-assets'); await fs.mkdir(assets);
    let book;
    try {
      book = await initMobiFile(input, assets);
      const chapters = [];
      for (const item of book.getSpine()) {
        const chapter = book.loadChapter(item.id); if (!chapter?.html) throw new Error();
        // MOBI resources are confined to our workspace; embed them in exported HTML.
        const html = chapter.html.replaceAll(assets + '/', 'mobi-assets/');
        chapters.push(await inlineLocalImages(html, path.join(workspace.dir, 'book.html')));
      }
      if (!chapters.length) throw new Error();
      return chapters;
    } catch { throw new Error('MOBI 无法读取鲸。加密、损坏和部分 Kindle 格式暂不支持。'); }
    finally { book?.destroy(); }
  }
  const entries = await zipEntries(input);
  const container = entries.get('META-INF/container.xml'); if (!container) throw new Error('EPUB 缺少目录信息鲸。');
  const parsed = xml(container.toString('utf8'));
  const files = parsed.container?.rootfiles?.rootfile;
  const root = (Array.isArray(files) ? files[0] : files)?.['@_full-path'];
  if (typeof root !== 'string' || !entries.has(root)) throw new Error('EPUB 目录无效鲸。');
  const opf = xml(entries.get(root).toString('utf8')).package;
  const manifest = new Map((Array.isArray(opf?.manifest?.item) ? opf.manifest.item : [opf?.manifest?.item]).filter(Boolean).map(i => [i['@_id'], i]));
  const spine = Array.isArray(opf?.spine?.itemref) ? opf.spine.itemref : [opf?.spine?.itemref];
  const chapters = [];
  for (const ref of spine) {
    const item = manifest.get(ref?.['@_idref']); if (!item) throw new Error('EPUB 章节不完整鲸。');
    const key = path.posix.normalize(path.posix.join(path.posix.dirname(root), decodeURIComponent(item['@_href'])));
    const bytes = entries.get(key); if (!bytes) throw new Error('EPUB 章节文件缺失鲸。');
    let html = bytes.toString('utf8');
    for (const match of [...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]) {
      const assetKey = path.posix.normalize(path.posix.join(path.posix.dirname(key), decodeURIComponent(match[1])));
      const image = entries.get(assetKey); if (!image) throw new Error('EPUB 图片附件缺失鲸。');
      const info = await require('sharp')(image, { limitInputPixels: 40_000_000 }).metadata();
      const mime = info.format === 'jpeg' ? 'jpeg' : info.format;
      if (!['jpeg', 'png', 'gif', 'webp'].includes(mime)) throw new Error('EPUB 中有不支持的图片类型鲸。');
      html = html.replace(match[0], match[0].replace(match[1], 'data:image/' + mime + ';base64,' + image.toString('base64')));
    }
    chapters.push(safeHtml(html));
  }
  if (!chapters.length) throw new Error('EPUB 没有可读取章节鲸。');
  return chapters;
}
async function writeEpub(chapters, workspace) {
  const files = [{ name: 'mimetype', bytes: Buffer.from('application/epub+zip') },
    { name: 'META-INF/container.xml', bytes: Buffer.from('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>') }];
  const manifest = [], spine = [], nav = [];
  for (const [i, body] of chapters.entries()) {
    let html = body, imageIndex = 0;
    for (const match of [...html.matchAll(/src="data:image\/(png|jpeg|gif|webp);base64,([A-Za-z\d+/=]+)"/g)]) {
      const name = 'image-' + i + '-' + imageIndex++ + '.' + (match[1] === 'jpeg' ? 'jpg' : match[1]);
      files.push({ name: 'OEBPS/' + name, bytes: Buffer.from(match[2], 'base64') });
      manifest.push('<item id="img' + i + '-' + imageIndex + '" href="' + name + '" media-type="image/' + match[1] + '"/>');
      html = html.replace(match[0], 'src="' + name + '"');
    }
    // Sanitizer output is HTML; use XML serializer for valid XHTML void elements.
    const xhtml = html.replace(/<(img|br|hr)(\b[^>]*?)(?<!\/)>(?!<\/\1>)/gi, '<$1$2/>').replaceAll('&nbsp;', '&#160;');
    files.push({ name: 'OEBPS/chapter-' + i + '.xhtml', bytes: Buffer.from('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>章节 ' + (i + 1) + '</title></head><body>' + xhtml + '</body></html>') });
    manifest.push('<item id="c' + i + '" href="chapter-' + i + '.xhtml" media-type="application/xhtml+xml"/>'); spine.push('<itemref idref="c' + i + '"/>');
    nav.push('<li><a href="chapter-' + i + '.xhtml">章节 ' + (i + 1) + '</a></li>');
  }
  files.push({ name: 'OEBPS/nav.xhtml', bytes: Buffer.from('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol>' + nav.join('') + '</ol></nav></body></html>') });
  files.push({ name: 'OEBPS/book.opf', bytes: Buffer.from('<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:' + require('node:crypto').randomUUID() + '</dc:identifier><dc:title>转换文档</dc:title><dc:language>zh</dc:language><meta property="dcterms:modified">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' + manifest.join('') + '</manifest><spine>' + spine.join('') + '</spine></package>') });
  return zipFiles(files, path.join(workspace.dir, 'result.epub'));
}
async function text(input, target, workspace, source, tools, params = {}) {
  let chapters, html, original, structure;
  const ext = source.ext === 'markdown' ? 'md' : source.ext === 'htm' ? 'html' : source.ext;
  if (['epub', 'mobi'].includes(ext)) { chapters = await ebook(input, source, workspace); html = chapters.join('\n<hr>\n'); }
  else {
    original = await decodeText(input, params.textEncoding);
    if (ext === 'json') { try { structure = JSON.parse(original); } catch { throw new Error('JSON 语法无效鲸。'); } }
    if (['yaml', 'yml'].includes(ext)) { try { structure = yaml.load(original, { schema: yaml.JSON_SCHEMA }); } catch { throw new Error('YAML 语法无效鲸。'); } }
    if (ext === 'xml') structure = xml(original);
    if (['csv', 'tsv'].includes(ext)) {
      try { const rows = parse(original, { delimiter: ext === 'csv' ? ',' : '\t', bom: true, skip_empty_lines: true });
        if (!rows.length || new Set(rows[0]).size !== rows[0].length) throw new Error();
        structure = rows.slice(1).map(row => Object.fromEntries(rows[0].map((key, i) => [key, row[i]])));
      } catch { throw new Error('CSV/TSV 格式或表头无效鲸。'); }
    }
    if (ext === 'html') html = await inlineLocalImages(original, params.originalPath || input);
    else if (ext === 'md') html = await inlineLocalImages(await require('marked').marked.parse(original), params.originalPath || input);
    else html = '<pre>' + escape(structure === undefined ? original : JSON.stringify(structure, null, 2)) + '</pre>';
    chapters = [html];
  }
  const output = path.join(workspace.dir, 'result.' + target);
  const warnings = [];
  if (['epub', 'mobi'].includes(ext)) warnings.push('保留章节阅读顺序与文字图片，书籍样式可能变化鲸。');
  if (target === 'epub') return { output: await writeEpub(chapters, workspace), warnings };
  if (['docx', 'pdf'].includes(target)) {
    const doc = path.join(workspace.dir, 'document.html'); await fs.writeFile(doc, htmlDocument(html));
    const docx = path.join(workspace.dir, 'document.docx');
    // Pandoc converts math from Markdown directly; sanitize/inline images before passing local input.
    if (ext === 'md') {
      const md = path.join(workspace.dir, 'document.md');
      let markdown = original;
      for (const match of [...original.matchAll(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)]) {
        const imageHtml = await inlineLocalImages('<img src="' + escape(match[2]) + '" alt="' + escape(match[1]) + '">', params.originalPath || input);
        const src = imageHtml.match(/src="([^"]+)"/)?.[1];
        markdown = markdown.replace(match[0], '![' + match[1] + '](' + src + ')');
      }
      for (const match of [...markdown.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]) {
        const image = await inlineLocalImages(match[0], params.originalPath || input);
        const src = image.match(/src="([^"]+)"/)?.[1], alt = image.match(/alt="([^"]*)"/)?.[1] || '';
        markdown = markdown.replace(match[0], '\n\n![' + alt.replaceAll(']', '\\]') + '](' + src + ')\n\n');
      }
      markdown = markdown.replace(/<\/?(?:figure|figcaption)\b[^>]*>/gi, '\n\n');
      await fs.writeFile(md, markdown);
      await command(tools.pandocPath, ['--sandbox', '-f', 'markdown+tex_math_dollars', '-t', 'docx', md, '-o', docx]);
    } else await command(tools.pandocPath, ['--sandbox', '-f', 'html', '-t', 'docx', doc, '-o', docx]);
    await checkOutput(docx);
    if (target === 'docx') return { output: docx, warnings };
    return { ...(await office(docx, 'pdf', workspace, { category: 'document' }, tools)), warnings };
  }
  let result;
  if (target === 'html') result = htmlDocument(html);
  else if (target === 'md') result = ['txt', 'log'].includes(ext) ? original : turndown.turndown(html);
  else if (target === 'txt') result = ['txt', 'log'].includes(ext) ? original : await require('./formats.cjs').markdownText(turndown.turndown(html));
  else if (target === 'json') { result = JSON.stringify(structure === undefined ? { text: original ?? turndown.turndown(html) } : structure, null, 2); if (structure === undefined) warnings.push('原文保存为 JSON 的 text 字段，未自动推断数据结构鲸。'); }
  else if (target === 'csv') {
    let rows = Array.isArray(structure) ? structure : structure && typeof structure === 'object' ? [structure] : null;
    if (rows && rows.every(row => row && typeof row === 'object' && !Array.isArray(row))) {
      const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
      result = stringify([keys, ...rows.map(row => keys.map(key => typeof row[key] === 'object' ? JSON.stringify(row[key]) : row[key] ?? ''))]);
    } else { result = stringify([['text'], [original ?? turndown.turndown(html)]]); warnings.push('原文保存为单列 CSV，未自动推断表格鲸。'); }
  } else throw new Error('不支持这个文本目标鲸。');
  if (!result?.trim()) throw new Error('没有可转换内容鲸。');
  await fs.writeFile(output, result, 'utf8'); return { output, warnings };
}
async function subtitle(input, target, workspace, source, tools) {
  const content = await decodeText(input);
  const output = path.join(workspace.dir, 'result.' + target);
  if (target === 'txt') {
    let text;
    if (['ass', 'ssa'].includes(source.ext)) {
      const format = content.match(/^Format:\s*(.+)$/im)?.[1]?.split(',').map(s => s.trim().toLowerCase());
      const index = format?.indexOf('text') ?? 9;
      text = content.split(/\r?\n/).filter(line => /^Dialogue:/i.test(line)).map(line => {
        const parts = line.replace(/^Dialogue:\s*/i, '').split(','); return parts.slice(index < 0 ? 9 : index).join(',').replace(/\{[^}]*\}/g, '').replace(/\\[Nn]/g, '\n');
      }).join('\n');
    } else text = content.split(/\r?\n/).filter(line => line.trim() && !/^WEBVTT|^\d+$|-->|^NOTE\b/.test(line.trim())).join('\n').replace(/<[^>]+>/g, '');
    if (!text.trim()) throw new Error('字幕没有可读取文字鲸。'); await fs.writeFile(output, text);
  } else {
    const codecs = { srt: 'srt', vtt: 'webvtt', ass: 'ass', ssa: 'ass' };
    await command(tools.ffmpegPath, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', input, '-map', '0:s:0', '-c:s', codecs[target], ...(target === 'ssa' ? ['-f', 'ass'] : []), output]);
  }
  await checkOutput(output); return { output, warnings: ['保留对白与时间轴；跨格式转换可能丢失字体、位置及特效鲸。'] };
}
module.exports = { office, docxHtml, document, text, subtitle, ebook, writeEpub, turndown };
