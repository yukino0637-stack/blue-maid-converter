const path = require('node:path');
const os = require('node:os');
function candidates(name, envName, platform = process.platform, env = process.env) {
  const p = platform === 'win32' ? path.win32 : path;
  const binary = platform === 'win32' && name === 'soffice' ? 'soffice.com' : name + (platform === 'win32' && !/\.(?:exe|com)$/i.test(name) ? '.exe' : '');
  const dirs = platform === 'win32' ? [
    p.join(env.ProgramFiles || 'C:\\Program Files', 'LibreOffice', 'program'),
    p.join(env.ProgramFiles || 'C:\\Program Files', 'Tesseract-OCR'),
    p.join(env.ProgramFiles || 'C:\\Program Files', 'Pandoc'),
    p.join(env.LOCALAPPDATA || os.homedir(), 'Pandoc'),
    p.join(env.USERPROFILE || os.homedir(), 'scoop', 'shims'),
  ] : ['/opt/homebrew/bin', '/usr/local/bin'];
  const paths = (env.PATH || env.Path || '').split(platform === 'win32' ? ';' : ':').filter(dir => dir && !dir.includes('codex-runtimes'));
  const explicit = env[envName];
  return [...new Set([...(platform === 'win32' && name === 'soffice' && /soffice\.exe$/i.test(explicit || '') ? [explicit.replace(/\.exe$/i, '.com')] : []), explicit, ...dirs.concat(paths).map(dir => p.join(dir, binary))].filter(file => file && p.isAbsolute(file)))];
}
function installHint(tool, platform = process.platform) {
  const brew = { libreoffice: '--cask libreoffice', ffmpeg: 'ffmpeg', poppler: 'poppler', pandoc: 'pandoc', qpdf: 'qpdf', jxl: 'jpeg-xl', raw: 'libraw', ocr: 'tesseract tesseract-lang', heif: 'imagemagick' };
  return platform === 'win32' ? '请按 docs/INSTALL.md 安装 ' + ({ ocr: 'Tesseract 和 chi_sim/eng 语言包', heif: '支持 HEIC 的 ImageMagick', jxl: 'JPEG XL', raw: 'LibRaw' }[tool] || tool) + '，并加入 PATH 或设置对应工具路径。' : 'brew install ' + brew[tool];
}
function structureRoot() {
  return process.env.PDF_STRUCTURE_HOME || (__dirname.includes('app.asar') ? path.join(os.homedir(), '.blue-maid-converter', 'pdf-structure') : path.join(__dirname, '..', '.local-tools/pdf-structure'));
}
function pythonIn(root) { return path.join(root, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'); }
function structureHelper() { return __dirname.includes('app.asar') ? path.join(process.resourcesPath, 'converter-tools/pdf-structure.py') : path.join(__dirname, 'pdf-structure.py'); }
module.exports = { candidates, installHint, structureRoot, pythonIn, structureHelper };
