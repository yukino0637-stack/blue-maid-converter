const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const result = spawnSync('launchctl', ['print', `gui/${process.getuid()}/local.blue-maid-converter.hotkey`], { encoding: 'utf8' });
assert.equal(result.status, 0, '登录启动项存在');
assert.match(result.stdout, /^\s*state = running$/m, '后台启动器正在运行');
const pid = Number(result.stdout.match(/^\s*pid = (\d+)$/m)?.[1]);
assert.ok(pid > 0);
process.kill(pid, 0);
const log = fs.readFileSync(path.join(__dirname, 'build', 'launcher.log'), 'utf8');
const error = fs.readFileSync(path.join(__dirname, 'build', 'launcher-error.log'), 'utf8');
assert.match(log, /Command\+D 已注册/);
assert.equal(error.trim(), '', '启动与注册没有错误');
const triggers = (log.match(/Command\+D：打开小女仆/g) || []).length;
if (process.argv.includes('--expect-trigger')) assert.ok(triggers > 0, '已捕获真实全局按键');
console.log(`PASS 后台启动器 PID ${pid}，全局键已注册，无错误；收到按键次数 ${triggers}。`);
if (!triggers) console.log('真实键盘触发尚未验证；注册成功不能代替按键实测。');
