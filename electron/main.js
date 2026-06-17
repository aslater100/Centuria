import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function createLauncherWindow() {
  return new BrowserWindow({
    width: 480,
    height: 300,
    resizable: false,
    frame: false,
    backgroundColor: '#141a14',
    title: 'Centuria',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
}

function createGameWindow() {
  return new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#141a14',
    title: 'Centuria',
  });
}

let gameOpening = false;

function openGame(launcher) {
  // The auto-updater can schedule openGame from multiple code paths (e.g. the
  // `error` event and the rejected checkForUpdates() promise both fire when no
  // release is reachable). Guard against opening a second game window, whose
  // ready-to-show would call launcher.close() on an already-destroyed window
  // and crash the main process with "Object has been destroyed".
  if (gameOpening) return;
  gameOpening = true;

  const game = createGameWindow();
  game.loadFile(path.join(__dirname, '../dist/index.html'));
  game.once('ready-to-show', () => {
    if (launcher && !launcher.isDestroyed()) launcher.close();
    if (!game.isDestroyed()) game.show();
  });
}

function send(win, channel, payload) {
  if (!win.isDestroyed()) win.webContents.send(channel, payload);
}

app.whenReady().then(() => {
  const launcher = createLauncherWindow();
  launcher.loadFile(path.join(__dirname, 'launcher.html'));

  launcher.webContents.once('did-finish-load', () => {
    send(launcher, 'launcher-version', app.getVersion());

    if (!app.isPackaged) {
      send(launcher, 'launcher-status', 'Dev mode — launching…');
      setTimeout(() => openGame(launcher), 600);
      return;
    }

    try {
      const { autoUpdater } = require('electron-updater');

      autoUpdater.on('checking-for-update', () =>
        send(launcher, 'launcher-status', 'Checking for updates…'));

      autoUpdater.on('update-not-available', () => {
        send(launcher, 'launcher-status', 'Up to date. Launching…');
        setTimeout(() => openGame(launcher), 700);
      });

      autoUpdater.on('update-available', () =>
        send(launcher, 'launcher-status', 'Update found. Downloading…'));

      autoUpdater.on('download-progress', ({ percent }) => {
        send(launcher, 'launcher-status', `Downloading update… ${Math.round(percent)}%`);
        send(launcher, 'launcher-progress', percent);
      });

      autoUpdater.on('update-downloaded', () => {
        send(launcher, 'launcher-status', 'Update ready. Restarting…');
        setTimeout(() => autoUpdater.quitAndInstall(), 1500);
      });

      autoUpdater.on('error', (err) => {
        console.warn('update check failed:', err?.message ?? err);
        send(launcher, 'launcher-status', 'Launching…');
        setTimeout(() => openGame(launcher), 700);
      });

      autoUpdater.checkForUpdates().catch((err) => {
        console.warn('update check failed:', err?.message ?? err);
        send(launcher, 'launcher-status', 'Launching…');
        setTimeout(() => openGame(launcher), 700);
      });

    } catch (err) {
      console.warn('updater unavailable:', err?.message ?? err);
      send(launcher, 'launcher-status', 'Launching…');
      setTimeout(() => openGame(launcher), 700);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) app.relaunch();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
