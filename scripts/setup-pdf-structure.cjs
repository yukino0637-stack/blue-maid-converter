// Explicit optional installation. Nothing here runs when the pet starts.
const { fs, path, command } = require('../src/conversion-utils.cjs');
(async () => {
  if (process.argv.includes('--user')) process.env.PDF_STRUCTURE_HOME = path.join(require('node:os').homedir(), '.blue-maid-converter', 'pdf-structure');
  const root = require('../src/platform-tools.cjs').structureRoot(), python = require('../src/platform-tools.cjs').pythonIn(root);
  await fs.mkdir(root, { recursive: true });
  let installed = false;
  try { installed = (await command(python, ['-c', 'import importlib.metadata as m; print(m.version("paddlepaddle"), m.version("paddleocr"), m.version("paddlex"))'])).stdout.trim() === '3.3.1 3.7.0 3.7.2'; } catch { /* Install below. */ }
  if (!installed) {
    const candidates = ['/opt/homebrew/opt/python@3.13/bin/python3.13', '/opt/homebrew/bin/python3', '/usr/local/bin/python3', ...require('../src/platform-tools.cjs').candidates('python', 'PYTHON_PATH'), 'python3'];
    let base;
    for (const candidate of candidates) {
      try { const version = (await command(candidate, ['-c', 'import sys; print(sys.version_info.major, sys.version_info.minor)'])).stdout.trim().split(' ').map(Number); if (version[0] === 3 && version[1] >= 9 && version[1] <= 13) { base = candidate; break; } } catch { /* Try next installed Python. */ }
    }
    if (!base) throw new Error('需要 Python 3.9–3.13 鲸。可先运行 brew install python@3.13。');
    console.log('创建项目独立 Python 环境，下载 CPU 表格引擎。');
    await command(base, ['-m', 'venv', root]);
    await command(python, ['-m', 'pip', 'install', 'paddlepaddle==3.3.1', 'paddleocr[doc-parser]==3.7.0', 'paddlex==3.7.2'], 15 * 60_000);
  }
  await fs.rm(path.join(root, 'ready.json'), { force: true });
  console.log('下载/校验官方模型；约 290 MB 下载量，安装后需约 2 GB 空间。');
  await command(python, [path.join(__dirname, 'install-pdf-structure.py')], 15 * 60_000);
  const { detectExtraTools } = require('../src/formats.cjs'), tools = await detectExtraTools();
  if (!tools.pdftoppmPath) throw new Error('安装验证需要 Poppler 鲸。请运行 brew install poppler。');
  console.log('在本机 CPU 识别三列表格、已知值与合并表头，成功后才启用。');
  await require('./pdf-structure-probe.cjs')(path.join(root, 'probe'), python, tools.pdftoppmPath);
  await fs.writeFile(path.join(root, 'ready.json'), JSON.stringify({ version: 1, tested: true, paddle: '3.3.1', paddleocr: '3.7.0', paddlex: '3.7.2' }));
  console.log('PASS 本机结构识别已启用。转换时只读本地模型，不下载、不上传文件。');
})().catch(error => { console.error('高级表格引擎安装失败鲸：' + error.message); process.exitCode = 1; });
