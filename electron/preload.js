const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  version: () => ipcRenderer.invoke('version'),
  takePendingFiles: () => ipcRenderer.invoke('take-files'),
  onOpenFile: cb => ipcRenderer.on('open-file', () => cb()),
  saveFile: (name, data) => ipcRenderer.invoke('save-file', name, data),
  checkUpdate: () => ipcRenderer.invoke('update-check'),
  downloadUpdate: () => ipcRenderer.invoke('update-download'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  notifyUpdate: ver => ipcRenderer.invoke('notify-update', ver),
  onUpdateClicked: cb => { ipcRenderer.removeAllListeners('update-clicked'); ipcRenderer.on('update-clicked', (_e, v) => cb(v)); },
  onUpdateProgress: cb => { ipcRenderer.removeAllListeners('update-progress'); ipcRenderer.on('update-progress', (_e, p) => cb(p)); }
});
