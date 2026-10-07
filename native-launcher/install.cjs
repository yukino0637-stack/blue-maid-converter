const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const build = path.join(root, 'build');
const label = 'local.blue-maid-converter.hotkey';
const domain = 'gui/' + process.getuid();
const binary = path.join(build, 'blue-maid-hotkey');
const plist = path.join(os.homedir(), 'Library', 'LaunchAgents', label + '.plist');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || `${command} 失败`);
  return result.stdout;
}

fs.mkdirSync(build, { recursive: true });
const vendor = path.join(root, 'vendor', 'HotKey');
const sources = fs.readdirSync(vendor).filter(name => name.endsWith('.swift')).map(name => path.join(vendor, name));
run('xcrun', ['swiftc', '-O', '-module-cache-path', path.join(build, 'module-cache'), ...sources, path.join(root, 'main.swift'), '-o', binary]);
fs.mkdirSync(path.dirname(plist), { recursive: true });
const settings = {
  Label: label,
  ProgramArguments: [binary, '/Applications/蓝毛小女仆.app'],
  RunAtLoad: true,
  KeepAlive: true,
  ThrottleInterval: 30,
  LimitLoadToSessionType: 'Aqua',
  StandardOutPath: path.join(build, 'launcher.log'),
  StandardErrorPath: path.join(build, 'launcher-error.log'),
};
run('plutil', ['-convert', 'xml1', '-o', plist, '-'], { input: JSON.stringify(settings) });
const existing = spawnSync('launchctl', ['print', domain + '/' + label], { encoding: 'utf8' });
if (existing.status === 0) run('launchctl', ['bootout', domain + '/' + label]);
run('launchctl', ['bootstrap', domain, plist]);
console.log('已安装独立 Command+D 启动器；人物可退出，启动器登录后自动保留。');
