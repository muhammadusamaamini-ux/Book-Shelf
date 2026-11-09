// Book Shelf for Windows (Electron)
const { app, BrowserWindow, protocol, ipcMain, dialog, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');

const WWW = path.join(__dirname, '..', 'www');
const FILE_TYPES = /\.(pdf|epub|docx|xlsx|xls|pptx)$/i;
let win = null;
const pending = [];

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

function filesFromArgs(argv) {
  return argv.filter(a => a && !a.startsWith('-') && FILE_TYPES.test(a) && fs.existsSync(a));
}
function queueFiles(list) {
  for (const f of list) if (!pending.includes(f)) pending.push(f);
  if (win && list.length) {
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send('open-file');
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => queueFiles(filesFromArgs(argv)));
  queueFiles(filesFromArgs(process.argv.slice(1)));
  app.whenReady().then(() => {
    protocol.handle('app', req => {
      const u = new URL(req.url);
      let p = decodeURIComponent(u.pathname);
      if (!p || p === '/') p = '/index.html';
      const file = path.normalize(path.join(WWW, p));
      if (!file.startsWith(WWW)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    createWindow();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1240, height: 860, minWidth: 380, minHeight: 500,
    title: 'Book Shelf', backgroundColor: '#E3E6DC', autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  win.loadURL('app://bookshelf/index.html');
}
app.on('window-all-closed', () => app.quit());

ipcMain.handle('version', () => app.getVersion());
ipcMain.handle('take-files', () => {
  const out = [];
  while (pending.length) {
    const f = pending.shift();
    try { out.push({ name: path.basename(f), data: new Uint8Array(fs.readFileSync(f)) }); } catch (e) { /* unreadable file */ }
  }
  return out;
});
ipcMain.handle('save-file', async (_e, name, data) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), name) });
  if (r.canceled || !r.filePath) return { saved: false };
  fs.writeFileSync(r.filePath, Buffer.from(data));
  return { saved: true, path: r.filePath };
});

// ---- updates from GitHub Releases
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
ipcMain.handle('update-check', async () => {
  if (!app.isPackaged) return { available: false };
  const r = await autoUpdater.checkForUpdates();
  const v = r && r.updateInfo && r.updateInfo.version;
  const newer = v && v !== app.getVersion() && v.localeCompare(app.getVersion(), undefined, { numeric: true }) > 0;
  let notes = r && r.updateInfo && r.updateInfo.releaseNotes;
  if (Array.isArray(notes)) notes = notes.map(n => n.note).join('\n');
  if (typeof notes === 'string') notes = notes.replace(/<[^>]+>/g, '');
  return { available: !!newer, version: v, notes: notes || '' };
});
ipcMain.handle('update-download', async () => {
  autoUpdater.removeAllListeners('download-progress');
  autoUpdater.on('download-progress', p => { if (win) win.webContents.send('update-progress', p.percent || 0); });
  await autoUpdater.downloadUpdate();
  return true;
});
ipcMain.handle('update-install', () => { setImmediate(() => autoUpdater.quitAndInstall(false, true)); return true; });
