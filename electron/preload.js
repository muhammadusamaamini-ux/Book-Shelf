const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  version: () => ipcRenderer.invoke('version'),
  takePendingFiles: () => ipcRenderer.invoke('take-files'),
  onOpenFile: cb => ipcRenderer.on('open-file', () => cb()),
  saveFile: (name, data) => ipcRenderer.invoke('save-file', name, data),
  checkUpdate: () => ipcRenderer.invoke('update-check'),
  downloadUpdate: () => ipcRenderer.invoke('update-download'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  onUpdateProgress: cb => { ipcRenderer.removeAllListeners('update-progress'); ipcRenderer.on('update-progress', (_e, p) => cb(p)); }
});
