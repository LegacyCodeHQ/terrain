import path from 'node:path';
import { app, BrowserWindow, session } from 'electron';
import { registerDialogHandlers } from './dialog-ipc-handlers';
import { registerRepoHandlers } from './repo-ipc-handlers';
import { registerSessionHandlers } from './session-ipc-handlers';

let mainWindow: BrowserWindow | null = null;

const APP_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join('; ');

const createMainWindow = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#111111',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[main] did-fail-load ${errorCode} ${errorDescription} url=${validatedURL}`,
      );
    },
  );

  mainWindow.webContents.on(
    'console-message',
    (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    },
  );

  return mainWindow;
};

app.whenReady().then(async () => {
  const isDev = Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);

  // In production, lock the renderer to a strict CSP. In dev, let Vite's HMR
  // client (inline scripts, eval, ws:) work without per-Vite-version CSP
  // surgery. The dev surface is local and trusted.
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const url = details.url ?? '';
      if (!url.startsWith('file://')) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      callback({
        responseHeaders: {
          ...(details.responseHeaders ?? {}),
          'Content-Security-Policy': [APP_CSP],
        },
      });
    });
  }

  registerDialogHandlers();
  registerRepoHandlers();
  registerSessionHandlers();
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
