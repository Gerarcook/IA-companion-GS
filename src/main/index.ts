import { app, BrowserWindow, globalShortcut } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBubbleWindow } from './window-manager';
import { registerIpcHandlers } from './ipc-handlers';
import { initDb } from './db';
import { createTray } from './tray';

/** Alterna la visibilidad de la ventana principal (invocado por tray y atajo global). */
function toggleWindow(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) hideWindow(win);
  else {
    win.show();
    win.focus();
  }
}

function hideWindow(win: BrowserWindow) {
  win.hide();
}

// Configuración de dotenv para variables de entorno
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let bubbleWindow: BrowserWindow | null = null;
let trayRef: ReturnType<typeof createTray> | null = null;
let isQuitting = false;

// Instancia única: una sola copia del asistente por máquina
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (bubbleWindow && !bubbleWindow.isDestroyed()) {
      bubbleWindow.show();
      bubbleWindow.focus();
    }
  });
}

function createWindows() {
  bubbleWindow = createBubbleWindow(__dirname);
  bubbleWindow.on('close', (e) => {
    // Segundo plano: cerrar la ventana oculta el asistente, no apaga la app
    if (!isQuitting) {
      e.preventDefault();
      bubbleWindow?.hide();
    }
  });
}

app.whenReady().then(() => {
  initDb();
  createWindows();
  if (bubbleWindow) {
    registerIpcHandlers(bubbleWindow);
    trayRef = createTray(bubbleWindow, () => toggleWindow(bubbleWindow), () => {
      isQuitting = true;
      app.exit(0);
    });
  }

  // Atajo global para invocar al asistente desde donde estés
  const shortcut = 'CommandOrControl+Alt+J';
  try {
    globalShortcut.register(shortcut, () => toggleWindow(bubbleWindow));
  } catch (err) {
    console.error('[shortcut] No se pudo registrar el atajo global:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

// Mantener el asistente vivo en segundo plano (vive en la bandeja)
app.on('window-all-closed', () => {
  // no-op: la app vive en tray
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch {}
});

// Manejo básico de errores no capturados
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
