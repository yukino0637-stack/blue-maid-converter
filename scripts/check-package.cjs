const assert = require('node:assert/strict');
const fs = require('node:fs');
const { listPackage, extractFile } = require('@electron/asar');
const archive = process.argv[2];
if (!archive) throw new Error('请提供 app.asar 路径');
const files = listPackage(archive).map(name => name.replaceAll('\\', '/'));
const forbidden = files.filter(name => /^\/(?:artifacts|test|\.local-tools|\.git|\.env|native-launcher\/build|dist)(?:\/|$)/.test(name) || /Ya1\.mp3|飞夺泸定桥|cat-.*transparent\.webm/.test(name));
assert.deepEqual(forbidden, []);
const json = file => JSON.parse(extractFile(archive, file).toString());
const expectedVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
assert.equal(json('package.json').version, expectedVersion);
const routes = json('src/conversion-routes.json').routes; assert.equal(routes.length, 98);
assert.ok(files.some(name => /node_modules\/@img\/sharp-(?:darwin-arm64|win32-x64)\//.test(name)));
assert.equal(files.filter(name => /assets\/dsh-pet\/.*\.webm$/.test(name)).length, 106);
const claudeWebm = files.filter(name => /assets\/claude-skin\/.*\.webm$/.test(name));
assert.equal(claudeWebm.length, 25);
for (const key of ['idle', 'working', 'finish', 'drag', 'fail', 'wave', 'hop', 'shy', 'pout', 'look', 'stretch', 'cube', 'think', 'sort', 'pace', 'tail', 'sidestep', 'squish', 'startle', 'bow', 'mirror', 'sway', 'violin', 'kite', 'kick']) {
  assert.ok(claudeWebm.some(name => name.endsWith(`/assets/claude-skin/${key}.webm`)), key);
}
assert.ok(files.some(name => name.endsWith('/assets/claude-skin/claude-character.png')));
assert.ok(files.some(name => name.endsWith('/assets/conversion-fonts/OFL.txt')));
console.log(`PASS 安装包版本 ${expectedVersion}、完整格式规则、106 份女仆动画、25 份 Claude 动画、原生图片依赖、字体许可；未包含测试数据、私人文件、模型或小黄鸭音效。`);
