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
