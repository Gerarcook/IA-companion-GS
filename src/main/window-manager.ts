import { app, BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createBubbleWindow(rootPath: string): BrowserWindow {
  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

  // Ícono de la app (logo de IA-companion-GS) si existe
  let iconPath: string | undefined;
  try {
    const candidate = path.join(app.getAppPath(), 'build', 'icon.png');
    if (existsSync(candidate)) iconPath = candidate;
  } catch {}

  // Posición: abajo a la derecha
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = 380;
  const windowHeight = 520;
  const x = screenWidth - windowWidth - 24;
  const y = screenHeight - windowHeight - 80;

  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    title: 'IA-companion-GS',
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(rootPath, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[window] did-fail-load:', { code, desc, url });
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[window] render-process-gone:', details);
  });

  win.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.error('[window] preload-error:', preloadPath, error);
  });

  win.webContents.on('console-message', (_e, level, message, line, source) => {
    const tag = ['LOG', 'WARN', 'ERROR', 'INFO'][level] || 'LOG';
    console.log(`[renderer ${tag}] ${message} (${source}:${line})`);
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173/';
    win.loadURL(devUrl).catch((err) => {
      console.error('[window] loadURL failed:', err);
    });
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // En producción, renderer está en dist/renderer (no dist/main/renderer)
    const rendererPath = path.join(rootPath, '..', 'renderer', 'index.html');
    win.loadFile(rendererPath).catch((err) => {
      console.error('[window] loadFile failed:', err, 'path:', rendererPath);
    });
  }

  return win;
}