// Book Shelf for Windows: "Received file" popup when a PDF, EPUB or Office file lands in Downloads,
// plus the tray icon that keeps this running after the window is closed.
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const WATCH = /\.(pdf|epub|docx|xlsx|xls|pptx)$/i;
const TEMP = /\.(crdownload|part|partial|tmp|download|opdownload)$/i;
const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let settings = { popup: true, startup: true, trayTold: false };
let settingsFile = null;
let watcher = null, tray = null, pop = null, popTimer = null, popFile = null;
const busy = new Set(), seen = new Map();
let hooks = { openFile: () => {}, showMain: () => {} };

function load() {
  settingsFile = path.join(app.getPath('userData'), 'bookshelf-settings.json');
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) }; } catch (e) { /* first run */ }
}
function save() { try { fs.writeFileSync(settingsFile, JSON.stringify(settings)); } catch (e) { /* ignore */ } }

/* ---- watching the Downloads folder ---- */
function startWatch() {
  if (watcher) return;
  const dir = app.getPath('downloads');
  try {
    watcher = fs.watch(dir, { persistent: true }, (_ev, name) => {
      if (!name || !WATCH.test(name) || TEMP.test(name)) return;
      check(path.join(dir, String(name)));
    });
    watcher.on('error', () => { stopWatch(); setTimeout(() => { if (settings.popup) startWatch(); }, 5000); });
  } catch (e) { watcher = null; }
}
function stopWatch() { if (watcher) { try { watcher.close(); } catch (e) { /* closed */ } watcher = null; } }

// waits until the browser has finished writing the file, then shows the popup once
async function check(full) {
  if (busy.has(full)) return;
  busy.add(full);
  try {
    let last = -1;
    for (let i = 0; i < 120; i++) {
      await sleep(600);
      let st;
      try { st = fs.statSync(full); } catch (e) { return; }
      if (!st.isFile()) return;
      if (Date.now() - st.mtimeMs > 3 * 60 * 1000) return; // an old file moved here, not a download
      if (st.size > 0 && st.size === last) {
        try { fs.closeSync(fs.openSync(full, 'r')); } catch (e) { continue; }
        const key = full + '|' + st.size;
        if (seen.has(key)) return;
        seen.set(key, Date.now());
        for (const [k, t] of seen) if (Date.now() - t > 30 * 60 * 1000) seen.delete(k);
        showPopup(full);
        return;
      }
      last = st.size;
    }
  } finally { busy.delete(full); }
}

/* ---- the popup in the corner of the screen ---- */
function placePopup() {
  const wa = screen.getPrimaryDisplay().workArea, W = 440, H = 168;
  return { width: W, height: H, x: wa.x + wa.width - W - 14, y: wa.y + wa.height - H - 14 };
}
function showPopup(file) {
  if (!settings.popup) return;
  popFile = file;
  const send = () => { if (pop && !pop.isDestroyed()) pop.webContents.send('popup-file', { name: path.basename(file), ext: path.extname(file).slice(1).toLowerCase() }); };
  if (!pop || pop.isDestroyed()) {
    pop = new BrowserWindow({
      ...placePopup(), frame: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, show: false, alwaysOnTop: true, backgroundColor: '#1B2232', title: 'Book Shelf', icon: ICON,
      webPreferences: { preload: path.join(__dirname, 'popup-preload.js'), contextIsolation: true, sandbox: true }
    });
    pop.setAlwaysOnTop(true, 'pop-up-menu');
    pop.loadFile(path.join(__dirname, 'popup.html'));
    pop.once('ready-to-show', () => { send(); pop.showInactive(); });
    pop.on('closed', () => { pop = null; });
  } else {
    pop.setBounds(placePopup());
    send();
    pop.showInactive();
  }
  holdPopup(false);
}
function holdPopup(hold) {
  clearTimeout(popTimer);
  if (!hold) popTimer = setTimeout(() => { if (pop && !pop.isDestroyed()) pop.hide(); }, 15000);
}
function hidePopup() { clearTimeout(popTimer); if (pop && !pop.isDestroyed()) pop.hide(); }

/* ---- tray icon ---- */
function trayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Book Shelf', click: () => hooks.showMain() },
    { type: 'separator' },
    { label: 'Show a popup when a PDF is downloaded', type: 'checkbox', checked: settings.popup, click: m => setSettings({ popup: m.checked }) },
    { label: 'Start with Windows', type: 'checkbox', checked: settings.startup, enabled: settings.popup, click: m => setSettings({ startup: m.checked }) },
    { type: 'separator' },
    { label: 'Quit Book Shelf', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}
function ensureTray() {
  if (!settings.popup) { if (tray) { tray.destroy(); tray = null; } return; }
  if (tray) return trayMenu();
  try {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    tray.setToolTip('Book Shelf — watching Downloads for new PDFs');
    tray.on('click', () => hooks.showMain());
    trayMenu();
  } catch (e) { tray = null; }
}
function applyStartup() {
  if (!app.isPackaged) return;
  try { app.setLoginItemSettings({ openAtLogin: !!(settings.popup && settings.startup), args: ['--hidden'] }); } catch (e) { /* not allowed */ }
}
function setSettings(patch) {
  settings = { ...settings, ...patch };
  save();
  if (settings.popup) startWatch(); else { stopWatch(); hidePopup(); }
  ensureTray(); applyStartup();
  if (!settings.popup && hooks.onOff) setTimeout(() => hooks.onOff(), 50);
  for (const w of BrowserWindow.getAllWindows()) if (w !== pop && !w.isDestroyed()) w.webContents.send('dl-settings', settings);
  return settings;
}

/* when the window is closed, keep running in the tray so the popup still works */
function keepInTray(win) {
  win.on('close', e => {
    if (app.isQuitting || !settings.popup) return;
    e.preventDefault();
    win.hide();
    if (!settings.trayTold && Notification.isSupported()) {
      settings.trayTold = true; save();
      new Notification({ title: 'Book Shelf is still running', body: 'It stays in the tray to tell you when a PDF is downloaded. Right-click its icon to turn this off or quit.', icon: ICON }).show();
    }
  });
}

function init(h) {
  hooks = { ...hooks, ...h };
  load();
  app.on('before-quit', () => { app.isQuitting = true; });
  ipcMain.on('popup-open', () => { const f = popFile; hidePopup(); if (f) hooks.openFile(f); });
  ipcMain.on('popup-close', (_e, dontShow) => { hidePopup(); if (dontShow) setSettings({ popup: false }); });
  ipcMain.on('popup-hold', (_e, hold) => holdPopup(!!hold));
  ipcMain.handle('dl-settings-get', () => settings);
  ipcMain.handle('dl-settings-set', (_e, patch) => setSettings({ popup: !!patch.popup, startup: !!patch.startup }));
  if (settings.popup) startWatch();
  ensureTray(); applyStartup();
}

module.exports = { init, keepInTray, isOn: () => settings.popup, showPopup };
