const test = require('node:test');
const assert = require('node:assert/strict');
const { candidates, installHint } = require('../src/platform-tools.cjs');
test('Windows 工具按 exe、Program Files 和 PATH 查找，安装提示不使用 brew', () => {
  const env = { ProgramFiles: 'C:\\Program Files', USERPROFILE: 'C:\\Users\\test', LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local', PATH: 'D:\\tools;C:\\tools with spaces', SOFFICE_PATH: 'E:\\Office\\soffice.exe' };
  const result = candidates('soffice', 'SOFFICE_PATH', 'win32', env);
  assert.equal(result[0], 'E:\\Office\\soffice.com');
  assert.ok(result.includes(env.SOFFICE_PATH));
  assert.ok(result.includes('C:\\Program Files\\LibreOffice\\program\\soffice.com'));
  assert.ok(result.includes('C:\\tools with spaces\\soffice.com'));
  assert.ok(!installHint('libreoffice', 'win32').includes('brew'));
  assert.equal(installHint('libreoffice', 'darwin'), 'brew install --cask libreoffice');
});
test('图片转换在读取结果元数据后也能清理临时文件，连续转换不受文件锁影响', async t => {
  const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
  const { convertFile } = require('../src/converter.cjs'), sharp = require('sharp');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-image-lock-'));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const input = path.join(root, 'image.png');
  await sharp({ create: { width: 32, height: 24, channels: 4, background: '#64a3d8' } }).png().toFile(input);
  const original = await fs.readFile(input);
  for (let i = 0; i < 4; i++) {
    const output = path.join(root, 'result-' + i + '.webp');
    assert.equal(await convertFile(input, output, null, { target: 'webp' }), output);
    assert.equal((await sharp(output).metadata()).format, 'webp');
  }
  assert.deepEqual(await fs.readFile(input), original);
});
