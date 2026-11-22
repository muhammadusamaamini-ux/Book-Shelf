// Book Shelf for Windows (Electron)
const { app, BrowserWindow, protocol, ipcMain, dialog, shell, net, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');
const downloads = require('./downloads');

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
  if (!list.length) return;
  if (!win || win.isDestroyed()) { if (app.isReady()) createWindow(); return; } // a new window takes the files when it starts
  showMain();
  win.webContents.send('open-file');
}
function showMain() {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

if (process.platform === 'win32') app.setAppUserModelId('com.usama.bookshelf');
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => { const f = filesFromArgs(argv); if (f.length) queueFiles(f); else showMain(); });
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
    downloads.init({
      openFile: f => queueFiles([f]),
      showMain,
      onOff: () => { if (!win || win.isDestroyed() || !win.isVisible()) { app.isQuitting = true; app.quit(); } }
    });
    // started with Windows: stay in the tray until a download or a click needs the window
    if (process.argv.includes('--hidden') && downloads.isOn() && !pending.length) return;
    createWindow();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1240, height: 860, minWidth: 380, minHeight: 500,
    title: 'Book Shelf', backgroundColor: '#12161F', autoHideMenuBar: true,
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
  // Ctrl+W closes the open tab (not the window); Ctrl+Tab moves between tabs
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return;
    const k = (input.key || '').toLowerCase();
    if (k === 'w' && !input.shift) { e.preventDefault(); win.webContents.send('tab-key', 'close'); }
  });
  win.loadURL('app://bookshelf/index.html');
  downloads.keepInTray(win);
  win.on('closed', () => { win = null; if (app.isQuitting || !downloads.isOn()) app.quit(); });
}
app.on('window-all-closed', () => { if (app.isQuitting || !downloads.isOn()) app.quit(); });

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

// ---- choose a folder, then write files into it (only folders the person picked)
const pickedFolders = new Set();
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose where to save', buttonLabel: 'Save here',
    defaultPath: app.getPath('documents'), properties: ['openDirectory', 'createDirectory', 'promptToCreate']
  });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return { path: null };
  const dir = r.filePaths[0];
  fs.mkdirSync(dir, { recursive: true });
  pickedFolders.add(dir);
  return { path: dir };
});
ipcMain.handle('write-to-folder', async (_e, dir, name, data) => {
  if (!pickedFolders.has(dir)) return { saved: false };
  const safe = path.basename(String(name)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'file';
  const ext = path.extname(safe), stem = safe.slice(0, safe.length - ext.length);
  let file = path.join(dir, safe);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${stem} (${i})${ext}`);
  fs.writeFileSync(file, Buffer.from(data));
  return { saved: true, path: file };
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

// ---- "New update available" notification in the Windows notification area
let lastNote = null;
ipcMain.handle('notify-update', (_e, ver) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title: 'New update available', body: `Book Shelf ${ver} is ready to download. Click to see it.`, icon: path.join(__dirname, '..', 'assets', 'icon.png') });
  n.on('click', () => {
    showMain(); if (win) win.webContents.send('update-clicked', ver);
  });
  n.show();
  lastNote = n; // keep a reference so the click still works later
  return true;
});
