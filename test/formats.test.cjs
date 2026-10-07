const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { describeFormat, formatOptions, parseTable, markdownText } = require('../src/formats.cjs');
const { inspectInput, convertFile } = require('../src/converter.cjs');

test('目标白名单、缺少工具隔离与多页结果扩展名', () => {
  const tools = { available: false, pdfSupported: false, ffmpeg: false, poppler: false };
  const image = formatOptions(describeFormat('.HEIC'), tools);
  assert.deepEqual(image.map(option => option.target), ['jpg', 'png', 'webp']);
  assert.ok(image.every(option => option.enabled));
  assert.ok(formatOptions(describeFormat('wav'), tools).every(option => !option.enabled && option.installCommand === 'brew install ffmpeg'));
  const slides = formatOptions(describeFormat('pptx'), { ...tools, available: true });
  assert.equal(slides[0].enabled, true);
  assert.equal(slides[1].extension, 'zip');
  assert.equal(slides[1].enabled, false);
  assert.deepEqual(describeFormat('.JPEG').targets, ['png', 'webp']);
  assert.equal(describeFormat('.exe'), null);
});

test('CSV/TSV 解析中文、引号、分隔符、换行和坏输入', () => {
  assert.deepEqual(parseTable('\ufeff姓名,备注\r\n小鲸,"逗号,\"\"引号\"\"\n换行"\r\n', 'csv'), [['姓名', '备注'], ['小鲸', '逗号,"引号"\n换行']]);
  assert.deepEqual(parseTable('姓名\t备注\n小鲸\t"内部\t制表符"\n', 'tsv'), [['姓名', '备注'], ['小鲸', '内部\t制表符']]);
  assert.throws(() => parseTable('a,b\n1,2,3', 'csv'), /表格文本格式/);
  assert.throws(() => parseTable('', 'csv'), /表格为空/);
});

test('Markdown 转可读文本，保留代码、列表、表格内容', async () => {
  const text = await markdownText('# 标题\n\n**你好** [链接](https://example.com)\n\n- 项目\n\n```js\nconst value = "**代码**";\n```\n\n| 名称 | 值 |\n|---|---|\n| 鲸 | 3 |');
  assert.match(text, /标题\n\n你好 链接/);
  assert.match(text, /• 项目/);
  assert.match(text, /const value = "\*\*代码\*\*";/);
  assert.match(text, /鲸\t3/);
  assert.ok(!text.includes('https://example.com'));
});

test('新格式拒绝伪造目标、错误扩展名、覆盖与坏编码', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-new-format-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, '文字 ; $(touch SHOULD_NOT_EXIST).txt');
  await fs.writeFile(input, '中文原文\n第二行');
  assert.deepEqual((await inspectInput(input)).targets, ['md']);
  await assert.rejects(convertFile(input, path.join(dir, 'fake.pdf'), null, { target: 'pdf' }), /不支持/);
  await assert.rejects(convertFile(input, path.join(dir, 'fake.txt'), null, { target: 'md' }), /扩展名/);
  const output = path.join(dir, 'existing.md');
  await fs.writeFile(output, 'KEEP');
  await assert.rejects(convertFile(input, output, null, { target: 'md' }), /已经存在/);
  assert.equal(await fs.readFile(output, 'utf8'), 'KEEP');
  const link = path.join(dir, 'link.md');
  await fs.symlink(input, link);
  await assert.rejects(convertFile(input, link, null, { target: 'md' }), /已经存在/);
  const saved = await convertFile(input, path.join(dir, 'result.md'), null, { target: 'md', details: true });
  assert.equal(await fs.readFile(saved.path, 'utf8'), '中文原文\n第二行');
  assert.equal(await fs.readFile(input, 'utf8'), '中文原文\n第二行');
  await assert.rejects(fs.access(path.join(dir, 'SHOULD_NOT_EXIST')));
  const bad = path.join(dir, 'bad.txt');
  await fs.writeFile(bad, Buffer.from([0xff, 0x80, 0x80]));
  await assert.rejects(inspectInput(bad), /编码/);
});
