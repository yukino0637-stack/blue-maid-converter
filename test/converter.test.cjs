const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { inspectInput, convertFile, probePdf, detectLibreOffice } = require('../src/converter.cjs');

// 用一个本机假转换程序检查文件保护与失败处理，不把它当作 LibreOffice 实际转换验证。
test('转换边界和原文件保护', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cat-converter-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, '猫咪 ; $(touch SHOULD_NOT_EXIST).DOC');
  const contents = '{\\rtf1\\ansi Sample document}';
  await fs.writeFile(source, contents);
  const argsLog = path.join(dir, 'arguments.json');
  const fake = path.join(dir, 'fake-soffice');
  const script = behavior => '#!' + process.execPath + '\n' +
    "const fs = require('node:fs'); const path = require('node:path');\n" +
    'const args = process.argv.slice(2);\n' +
    `fs.writeFileSync(${JSON.stringify(argsLog)}, JSON.stringify(args));\n` +
    'const outdir = args[args.indexOf("--outdir") + 1];\n' + behavior;
  await fs.writeFile(fake, script('fs.writeFileSync(path.join(outdir, "input.pdf"), "%PDF-1.4\\nTEST OUTPUT\\n%%EOF");'), { mode: 0o700 });

  await t.test('空文件、目录、假扩展名和不支持的格式会被拒绝', async () => {
    await fs.writeFile(path.join(dir, 'empty.pdf'), '');
    await fs.writeFile(path.join(dir, 'fake.pdf'), 'not a PDF');
    await fs.writeFile(path.join(dir, 'fake.docx'), 'not a ZIP');
    await fs.writeFile(path.join(dir, 'other.mp4'), 'movie');
    for (const name of ['empty.pdf', 'fake.pdf', 'fake.docx', 'other.mp4']) {
      await assert.rejects(inspectInput(path.join(dir, name)));
    }
    await assert.rejects(inspectInput(dir));
    await assert.rejects(inspectInput('relative.docx'));
    await assert.rejects(inspectInput(path.join(dir, 'missing.docx')));
    assert.equal((await inspectInput(source)).target, 'pdf');
  });

  await t.test('成功结果使用独立配置，特殊文件名不作为 shell 命令执行', async () => {
    const output = path.join(dir, 'result.pdf');
    const saved = await convertFile(source, output, fake);
    assert.equal(saved, await fs.realpath(output));
    assert.match(await fs.readFile(output, 'utf8'), /^%PDF-/);
    assert.equal(await fs.readFile(source, 'utf8'), contents);
    const args = JSON.parse(await fs.readFile(argsLog, 'utf8'));
    assert.ok(args.some(arg => arg.startsWith('-env:UserInstallation=file:')));
    assert.equal(path.basename(args.at(-1)), 'input.doc');
    await assert.rejects(fs.access(path.join(dir, 'SHOULD_NOT_EXIST')));
    await assert.rejects(fs.access(path.dirname(args.at(-1))), '临时目录应清理');
  });

  await t.test('已存在的目标文件和目标符号链接不会被覆盖', async () => {
    const output = path.join(dir, 'existing.pdf');
    await fs.writeFile(output, 'KEEP THIS FILE');
    await assert.rejects(convertFile(source, output, fake), /已经存在/);
    assert.equal(await fs.readFile(output, 'utf8'), 'KEEP THIS FILE');
    const link = path.join(dir, 'link.pdf');
    await fs.symlink(source, link);
    await assert.rejects(convertFile(source, link, fake), /已经存在/);
    assert.equal(await fs.readFile(source, 'utf8'), contents);
  });

  await t.test('不能使用错误的目标格式或相对路径', async () => {
    await assert.rejects(convertFile(source, path.join(dir, 'result.docx'), fake), /扩展名/);
    await assert.rejects(convertFile(source, 'result.pdf', fake), /扩展名/);
  });

  await t.test('进程报告成功但未生成有效文件时，不能报转换成功', async () => {
    await fs.writeFile(fake, script('fs.writeFileSync(path.join(outdir, "input.pdf"), "INVALID");'));
    const output = path.join(dir, 'invalid-result.pdf');
    await assert.rejects(convertFile(source, output, fake), /没有生成有效/);
    await assert.rejects(fs.access(output));
    assert.equal(await fs.readFile(source, 'utf8'), contents);
    const args = JSON.parse(await fs.readFile(argsLog, 'utf8'));
    await assert.rejects(fs.access(path.dirname(args.at(-1))));
  });

  await t.test('转换进程失败时原文件保留，并清理临时文件', async () => {
    await fs.writeFile(fake, script('process.exit(2);'));
    const output = path.join(dir, 'failed-result.pdf');
    await assert.rejects(convertFile(source, output, fake), /转换失败/);
    await assert.rejects(fs.access(output));
    assert.equal(await fs.readFile(source, 'utf8'), contents);
    const args = JSON.parse(await fs.readFile(argsLog, 'utf8'));
    await assert.rejects(fs.access(path.dirname(args.at(-1))));
  });

  await t.test('PDF→Word 不接收无效的 Word 输出', async () => {
    const pdf = path.join(dir, 'input.pdf');
    await fs.writeFile(pdf, probePdf());
    await fs.writeFile(fake, script('fs.writeFileSync(path.join(outdir, "input.docx"), "NOT A WORD FILE");'));
    assert.equal((await inspectInput(pdf)).target, 'docx');
    await assert.rejects(convertFile(pdf, path.join(dir, 'invalid.docx'), fake), /没有生成有效/);
    assert.match(await fs.readFile(pdf, 'utf8'), /^%PDF-/);
  });

  await t.test('PDF 原始源码被装进 DOCX 时，能力检测和实际转换均需拒绝', async () => {
    const fallback = `
      const { execFileSync } = require('node:child_process');
      const zipdir = path.join(outdir, 'zip');
      fs.mkdirSync(path.join(zipdir, 'word'), { recursive: true });
      const text = fs.readFileSync(args.at(-1), 'utf8').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      fs.writeFileSync(path.join(zipdir, 'word', 'document.xml'), '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>' + text + '</w:t></w:r></w:p></w:body></w:document>');
      const output = path.join(outdir, path.parse(args.at(-1)).name + '.docx');
      execFileSync('/usr/bin/zip', ['-q', output, 'word/document.xml'], { cwd: zipdir });
    `;
    // 版本检测没有 --outdir，先处理 --version 再解析转换参数。
    const cli = '#!' + process.execPath + '\n' +
      "const fs = require('node:fs'); const path = require('node:path'); const args = process.argv.slice(2);\n" +
      'if (args.includes("--version")) { console.log("LibreOffice 1.0 TEST"); process.exit(0); }\n' +
      'const outdir = args[args.indexOf("--outdir") + 1];\n' + fallback;
    await fs.writeFile(fake, cli);
    const previous = process.env.SOFFICE_PATH;
    process.env.SOFFICE_PATH = fake;
    try {
      const tool = await detectLibreOffice();
      assert.equal(tool.available, true);
      assert.equal(tool.pdfSupported, false, 'PDF 源码里存在标记，仍不能算导入成功');
      const pdf = path.join(dir, 'input.pdf');
      await fs.writeFile(pdf, probePdf());
      const output = path.join(dir, 'raw-fallback.docx');
      await assert.rejects(convertFile(pdf, output, fake), /没有生成有效/);
      await assert.rejects(fs.access(output));
      const validCli = cli
        .replace('+ text +', '+ "CAT_PDF_IMPORT_CHECKCAT_PDF_IMPORT_CHECK" +')
        .replace('<w:p><w:r><w:t>', '<w:p><w:r><w:instrText>609600963930</w:instrText></w:r><w:r><w:t>');
      await fs.writeFile(fake, validCli);
      assert.equal((await detectLibreOffice()).pdfSupported, true, '域代码和重复备用文本不应造成误判');
    } finally {
      if (previous === undefined) delete process.env.SOFFICE_PATH;
      else process.env.SOFFICE_PATH = previous;
    }
  });
});
