import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';

/** Ícono de bandeja de reserva (anillo cian) por si no está disponible el logo. */
const TRAY_ICON_BASE64 =
  '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';

/**
 * Tray del asistente: acceso permanente desde la bandeja del sistema.
 */
export function createTray(win: BrowserWindow, onToggle: () => void, onQuit: () => void): Tray {
  // Preferir el logo del proyecto; caer al anillo embebido si no existe
  let icon = nativeImage.createEmpty();
  const candidates = [
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(process.resourcesPath ?? '', 'icon.png'),
  ];
  for (const candidate of candidates) {
    try {
      if (candidate && existsSync(candidate)) {
        icon = nativeImage.createFromPath(candidate);
        if (!icon.isEmpty()) break;
      }
    } catch {}
  }
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`);
  }
  const tray = new Tray(icon);
  tray.setToolTip('IA-companion-GS — Asistente de escritorio');

  const menu = Menu.buildFromTemplate([
    { label: 'Mostrar / ocultar asistente', click: onToggle },
    { type: 'separator' },
    { label: 'Salir', click: onQuit },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', onToggle);

  return tray;
}
