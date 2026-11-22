const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('popup', {
  onFile: cb => ipcRenderer.on('popup-file', (_e, f) => cb(f)),
  open: () => ipcRenderer.send('popup-open'),
  close: dontShow => ipcRenderer.send('popup-close', !!dontShow),
  hold: on => ipcRenderer.send('popup-hold', !!on)
});
