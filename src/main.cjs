const { app, BrowserWindow, ipcMain, dialog, Menu, screen, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { detectLibreOffice, inspectInput, convertFile } = require('./converter.cjs');
const { detectExtraTools, formatOptions } = require('./formats.cjs');
const { readSound, loadSoundSettings, saveSoundSettings } = require('./sound.cjs');
const petActions = require('./actions.js');

let petWindow;
let pending;
let resultPath;
let busy = false;
let tool;
let toolCheck;
let moveOrigin;
let hitRegions = [];
let pointerTimer;
let ignoresMouse;
let soundSettings;
let soundCandidate;
let soundImporting = false;
const pagePath = path.join(__dirname, 'index.html');

function trusted(event) {
  if (event.sender !== petWindow?.webContents || event.senderFrame !== event.sender.mainFrame ||
      event.senderFrame.url !== pathToFileURL(pagePath).href) throw new Error('不允许的页面请求。');
}

function toolInfo(info) {
  const { executable, ffmpegPath, ffprobePath, pdftoppmPath, ...publicInfo } = info;
  return { ...publicInfo, options: pending ? formatOptions(pending, info) : undefined };
}

async function checkTool() {
  if (!toolCheck) {
    toolCheck = Promise.all([detectLibreOffice(), detectExtraTools()]).then(([office, extra]) => {
      tool = { ...office, ...extra }; return tool;
    })
      .finally(() => { toolCheck = undefined; });
  }
  return toolInfo(await toolCheck);
}

function handler(channel, action) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      trusted(event);
      return { ok: true, value: await action(...args) };
    } catch (error) {
      return { ok: false, error: error.message || '操作失败鲸，请重试。' };
    }
  });
}

handler('pet:tool', checkTool);
handler('pet:sound', async () => {
  if (!soundSettings) {
    try { soundSettings = await loadSoundSettings(app.getPath('userData')); }
    catch (error) {
      soundSettings = { selected: 'duck', custom: null };
      return { ...soundSettings, warning: error.message };
    }
  }
  return soundSettings;
});
handler('pet:sound-import', async () => {
  if (busy || soundImporting) throw new Error('正在处理文件，请稍后导入音效喵。');
  soundImporting = true;
  soundCandidate = undefined;
  try {
    const choice = await dialog.showOpenDialog(petWindow, {
      title: '导入点击音效', buttonLabel: '导入音效', properties: ['openFile'],
      filters: [{ name: '音效（MP3 / WAV）', extensions: ['mp3', 'wav'] }],
    });
    if (choice.canceled || choice.filePaths.length !== 1) return null;
    if (busy) throw new Error('正在转换文件，请稍后导入音效鲸。');
    soundCandidate = await readSound(choice.filePaths[0]);
    return soundCandidate;
  } finally { soundImporting = false; }
});
handler('pet:sound-select', async selection => {
  if (busy) throw new Error('正在转换文件，请稍后切换音效鲸。');
  if (!['duck', 'custom', 'import'].includes(selection)) throw new Error('不支持的音效选项。');
  if (selection === 'import' && !soundCandidate) throw new Error('请先选择要导入的音效喵。');
  const previous = soundSettings || { selected: 'duck', custom: null };
  const next = { selected: selection === 'import' ? 'custom' : selection,
    custom: selection === 'import' ? soundCandidate : previous.custom };
  soundSettings = await saveSoundSettings(app.getPath('userData'), next);
  soundCandidate = undefined;
  return soundSettings;
});
handler('pet:prepare', async input => {
  if (busy) throw new Error('正在转换鲸，请稍等。');
  const source = await inspectInput(input);
  if (!tool) await checkTool();
  pending = source;
  resultPath = undefined;
  return { name: source.name, ext: source.ext, category: source.category, target: source.target, options: formatOptions(source, tool) };
});
handler('pet:clear', () => { if (!busy) pending = undefined; });
handler('pet:convert', async target => {
  if (busy) throw new Error('正在转换鲸，请稍等。');
  if (!pending) throw new Error('先把文件拖给我鲸。');
  busy = true;
  const source = pending;
  try {
    if (!tool) await checkTool();
    const option = formatOptions(source, tool).find(item => item.target === target);
    if (!option) throw new Error('不支持这个转换目标鲸。');
    if (!option.enabled) throw new Error(option.reason + '鲸。请运行 ' + option.installCommand + ' 后重新检查。');
    const choice = await dialog.showSaveDialog(petWindow, {
      title: '保存转换结果鲸',
      defaultPath: path.join(path.dirname(source.path), path.parse(source.name).name + '-转换.' + option.extension),
      buttonLabel: '转换并保存',
      filters: [{ name: option.label + (option.extension === 'zip' ? '（ZIP）' : ''), extensions: [option.extension] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (choice.canceled || !choice.filePath) return { canceled: true };
    petWindow.webContents.send('pet:conversion-started');
    const result = await convertFile(source.path, choice.filePath, tool.executable, { target, tools: tool, details: true });
    resultPath = result.path;
    pending = undefined;
    return { canceled: false, name: path.basename(resultPath), warnings: result.warnings };
  } finally { busy = false; }
});
handler('pet:reveal', async () => {
  if (!resultPath) throw new Error('还没有转换结果鲸。');
  shell.showItemInFolder(resultPath);
});
handler('pet:actions', () => {
  if (busy) return;
  return new Promise(resolve => {
    let selected;
    const categories = [...new Set(Object.values(petActions).map(action => action.category))];
    const menu = Menu.buildFromTemplate([
      ...categories.map(category => ({ label: category, submenu: Object.entries(petActions)
        .filter(([, action]) => action.category === category)
        .map(([id, action]) => ({ id, label: action.label, click: () => { selected = id; } })) })),
      { type: 'separator' },
      { id: 'idle', label: '回到待机', click: () => { selected = 'idle'; } },
    ]);
    menu.popup({ window: petWindow, callback: () => resolve(selected) });
  });
});

ipcMain.on('pet:regions', (event, regions) => {
  try {
    trusted(event);
    if (!Array.isArray(regions) || regions.length > 8) return;
    const { width, height } = petWindow.getBounds();
    hitRegions = regions.filter(rect => Array.isArray(rect) && rect.length === 4 &&
      rect.every(Number.isFinite) && rect[0] >= 0 && rect[1] >= 0 &&
      rect[2] > 0 && rect[3] > 0 && rect[0] + rect[2] <= width + 1 && rect[1] + rect[3] <= height + 1);
  } catch { /* 非本地页面的事件不处理。 */ }
});
ipcMain.on('pet:move-start', event => {
  try {
    trusted(event);
    moveOrigin = { cursor: screen.getCursorScreenPoint(), bounds: petWindow.getBounds() };
  } catch { /* 不处理非可信事件。 */ }
});
ipcMain.on('pet:move', event => {
  try {
    trusted(event);
    if (!moveOrigin) return;
    const cursor = screen.getCursorScreenPoint();
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    const { bounds, cursor: start } = moveOrigin;
    petWindow.setPosition(
      Math.round(Math.max(area.x, Math.min(area.x + area.width - bounds.width, bounds.x + cursor.x - start.x))),
      Math.round(Math.max(area.y, Math.min(area.y + area.height - bounds.height, bounds.y + cursor.y - start.y))),
    );
  } catch { /* 窗口关闭时忽略移动事件。 */ }
});
ipcMain.on('pet:move-end', event => { try { trusted(event); moveOrigin = undefined; } catch {} });
ipcMain.on('pet:quit', event => { try { trusted(event); if (!busy) app.quit(); } catch {} });

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  petWindow = new BrowserWindow({
    width: 360, height: 400,
    x: area.x + area.width - 388, y: area.y + area.height - 428,
    title: '小猫文件转换器', frame: false, transparent: true, backgroundColor: '#00000000',
    alwaysOnTop: true, resizable: false, maximizable: false, fullscreenable: false,
    hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  petWindow.webContents.on('will-navigate', event => event.preventDefault());
  petWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  petWindow.once('ready-to-show', () => petWindow.showInactive());
  petWindow.on('blur', () => { moveOrigin = undefined; });
  petWindow.on('closed', () => { clearInterval(pointerTimer); petWindow = undefined; });
  // 使用实际鼠标位置判断透明区域，让 Finder 拖文件时也能进入接收区域。
  pointerTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = petWindow.getBounds();
    const x = cursor.x - bounds.x;
    const y = cursor.y - bounds.y;
    const hit = moveOrigin || hitRegions.some(([rx, ry, w, h]) => x >= rx && x <= rx + w && y >= ry && y <= ry + h);
    const ignore = !hit;
    if (ignore !== ignoresMouse) {
      petWindow.setIgnoreMouseEvents(ignore, { forward: true });
      ignoresMouse = ignore;
    }
  }, 60);
  petWindow.loadFile(pagePath);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (petWindow) { petWindow.show(); petWindow.focus(); } });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '小猫转换器', submenu: [{ role: 'about' }, { type: 'separator' },
        { label: '退出小猫', accelerator: 'Command+Q', click: () => app.quit() }] },
      { role: 'editMenu' },
    ]));
    app.on('before-quit', event => {
      if (busy) { event.preventDefault(); dialog.showMessageBox(petWindow, { message: '正在转换文件，请完成后再退出鲸。' }); }
    });
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
