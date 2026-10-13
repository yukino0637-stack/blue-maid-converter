const { contextBridge, ipcRenderer, webUtils } = require('electron');

async function invoke(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

contextBridge.exposeInMainWorld('cat', {
  checkTool: () => invoke('pet:tool'),
  prepareFile: file => invoke('pet:prepare', webUtils.getPathForFile(file)),
  prepareFiles: files => invoke('pet:prepare', files.map(file => webUtils.getPathForFile(file))),
  clear: () => invoke('pet:clear'),
  convert: (target, params) => invoke('pet:convert', target, params),
  onConversionStarted: callback => { ipcRenderer.on('pet:conversion-started', () => callback()); },
  reveal: () => invoke('pet:reveal'),
  actionMenu: () => invoke('pet:actions'),
  soundSettings: () => invoke('pet:sound'),
  importSound: () => invoke('pet:sound-import'),
  selectSound: selection => invoke('pet:sound-select', selection),
  setRegions: regions => ipcRenderer.send('pet:regions', regions),
  startMove: () => ipcRenderer.send('pet:move-start'),
  move: () => ipcRenderer.send('pet:move'),
  endMove: () => ipcRenderer.send('pet:move-end'),
  quit: () => ipcRenderer.send('pet:quit'),
});
