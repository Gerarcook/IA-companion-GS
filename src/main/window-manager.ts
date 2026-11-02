import { app, BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Tamaños de la ventana por modo. La ventana se ajusta al contenido visible:
 * en modo burbuja es apenas el cuadro de la burbuja, así no queda ningún
 * rectángulo invisible bloqueando clicks alrededor.
 */
export const WINDOW_SIZES = {
  bubble: { width: 88, height: 88 },
  chat: { width: 530, height: 700 },
  expanded: { width: 900, height: 720 },
} as const;

export type WindowMode = keyof typeof WINDOW_SIZES;

/** Modo actual y si el puntero está sobre la burbuja (para el click-through). */
let currentMode: WindowMode = 'bubble';
let pointerOverBubble = false;

export function getWindowMode(): WindowMode {
  return currentMode;
}

/**
 * En modo burbuja, las zonas transparentes de la ventana se vuelven
 * click-through: los clicks pasan a lo que haya debajo salvo sobre la burbuja.
 */
function refreshInteraction(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  const ignore = currentMode === 'bubble' && !pointerOverBubble;
  try {
    // forward:true deja seguir recibiendo mousemove para detectar el hover
    win.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined);
  } catch (err) {
    console.error('[window] setIgnoreMouseEvents falló:', err);
  }
}

/** El renderer avisa cuándo el puntero entra/sale de la burbuja. */
export function setPointerOverBubble(win: BrowserWindow | null, over: boolean): void {
  pointerOverBubble = over;
  refreshInteraction(win);
}

/** Aplica un modo redimensionando y manteniendo fija la esquina inferior derecha. */
export function setWindowMode(win: BrowserWindow | null, mode: WindowMode): void {
  if (!win || win.isDestroyed()) return;
  currentMode = mode;
  pointerOverBubble = false;

  const bounds = win.getBounds();
  const { workArea } = screen.getDisplayMatching(bounds);
  const target = WINDOW_SIZES[mode];
  const width = Math.min(target.width, workArea.width);
  const height = Math.min(target.height, workArea.height);

  // Anclar abajo-derecha para que la burbuja no "salte" al agrandar
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  let x = right - width;
  let y = bottom - height;
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width));
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height));

  win.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
  refreshInteraction(win);
}

/** Re-sincroniza el click-through (por ejemplo, al mostrar la ventana). */
export function syncWindowInteraction(win: BrowserWindow | null): void {
  refreshInteraction(win);
}

/** Al ocultar la ventana, olvidar el hover para que al re-mostrar no quede clickeable por error. */
export function resetPointerOverBubble(win: BrowserWindow | null): void {
  pointerOverBubble = false;
  refreshInteraction(win);
}

export function createBubbleWindow(rootPath: string): BrowserWindow {
  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

  // Ícono de la app (logo de IA-companion-GS) si existe
  let iconPath: string | undefined;
  try {
    const candidate = path.join(app.getAppPath(), 'build', 'icon.png');
    if (existsSync(candidate)) iconPath = candidate;
  } catch {}

  // Posición: abajo a la derecha, chiquita (solo la burbuja)
  const { workArea } = screen.getPrimaryDisplay();
  const { width: windowWidth, height: windowHeight } = WINDOW_SIZES.bubble;
  const margin = 16;
  const x = workArea.x + workArea.width - windowWidth - margin;
  const y = workArea.y + workArea.height - windowHeight - margin;

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

  // Al volver de oculta, restaurar el click-through del modo actual
  win.on('show', () => refreshInteraction(win));

  win.once('ready-to-show', () => {
    win.show();
    refreshInteraction(win);
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
