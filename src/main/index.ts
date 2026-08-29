import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBubbleWindow } from './window-manager';
import { registerIpcHandlers } from './ipc-handlers';
import { initDb } from './db';
import { readFile } from 'node:fs/promises';

// Configuración de dotenv para variables de entorno
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let bubbleWindow: BrowserWindow | null = null;

function createWindows() {
  bubbleWindow = createBubbleWindow(__dirname);
}

app.whenReady().then(() => {
  initDb();
  createWindows();
  registerIpcHandlers(bubbleWindow!);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Manejo básico de errores no capturados
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});