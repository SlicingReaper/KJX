// KJX desktop shell. Serves the built app from dist/ over a private kjx:// scheme
// (Cesium's web workers don't run from file:// URLs).
const { app, BrowserWindow, protocol, net, shell, ipcMain, screen } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'kjx', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const DIST = path.join(__dirname, '..', 'dist');

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1000,
    minHeight: 650,
    title: 'KJX',
    backgroundColor: '#0a1420',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 11 },
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
    // KJX_TEST_HIDDEN=1: automated tests render without putting a window on screen.
    show: !process.env.KJX_TEST_HIDDEN,
  });
  if (process.env.KJX_TEST_HIDDEN && app.dock) app.dock.hide();
  win.setWindowButtonVisibility(false); // traffic lights appear with the auto-hiding top bar
  win.on('enter-full-screen', () => win.webContents.send('ui:fullscreen', true));
  win.on('leave-full-screen', () => { win.webContents.send('ui:fullscreen', false); win.setWindowButtonVisibility(false); });
  // Auto-hiding top bar, decided here from the real cursor position. (Page mouse events stop as
  // soon as the cursor is over a drag region, so the page can't tell on its own.)
  let barShown = false, outsideSince = 0;
  const setBar = (v) => {
    if (v === barShown) return;
    barShown = v;
    win.setWindowButtonVisibility(v);
    win.webContents.send('ui:topbar-state', v);
  };
  const barTimer = setInterval(() => {
    if (win.isDestroyed()) return clearInterval(barTimer);
    if (win.isFullScreen() || win.isMinimized() || !win.isVisible()) return setBar(false);
    const c = screen.getCursorScreenPoint(), b = win.getContentBounds();
    const inX = c.x >= b.x && c.x <= b.x + b.width;
    const dy = c.y - b.y;
    const want = inX && dy >= -4 && dy <= (barShown ? 46 : 10); // reach the top edge to show; stays while over the bar
    if (want) { outsideSince = 0; setBar(true); }
    else if (barShown) {
      outsideSince ||= Date.now();
      if (Date.now() - outsideSince > 450) setBar(false);
    }
  }, 60);
  win.loadURL('kjx://app/index.html');
  // Open Wikipedia / Wikidata / Maps links in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  // Offline engine: disk pack + LRU cache (5 GB cap) behind every https request.
  const offline = require('./offline.cjs');
  offline.install();
  const dataFile = path.join(DIST, 'data', 'kjx.json');
  ipcMain.handle('offline:status', () => offline.status());
  ipcMain.handle('offline:has', (_e, urls) => offline.has(urls));
  ipcMain.handle('offline:startPack', () => { offline.startPack(dataFile); });
  ipcMain.handle('offline:pausePack', () => offline.pausePack());
  ipcMain.handle('offline:clearCache', () => offline.clearCache());
  ipcMain.handle('offline:estimateArea', (_e, bbox) => offline.estimateArea(bbox));
  ipcMain.handle('offline:downloadArea', (_e, bbox) => { offline.downloadArea(bbox); });
  ipcMain.handle('offline:cancelArea', () => offline.cancelArea());
  offline.onUpdate((st) => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('offline:update', st)));
  app.on('before-quit', () => { offline.flush(); });
  ipcMain.handle('ui:isFullscreen', (e) => BrowserWindow.fromWebContents(e.sender)?.isFullScreen() ?? false);

  protocol.handle('kjx', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
