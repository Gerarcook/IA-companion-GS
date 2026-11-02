import path from 'node:path';
import { dialog, BrowserWindow } from 'electron';
import { authorizePath, isPathAuthorized, listAuthorizedPaths, revokePath } from './db';

export class FilePermissions {
  constructor(private win: BrowserWindow) {}

  async requestDirectoryAccess(): Promise<string | null> {
    const result = await dialog.showOpenDialog(this.win, {
      properties: ['openDirectory'],
      title: 'Selecciona una carpeta para autorizar acceso',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const dir = result.filePaths[0];
    authorizePath(dir);
    return dir;
  }

  isAuthorized(targetPath: string): boolean {
    return isPathAuthorized(targetPath);
  }

  /** Verifica si un archivo está dentro de alguna carpeta autorizada (o es la propia raíz). */
  isWithinAuthorized(targetPath: string): boolean {
    let resolved: string;
    try {
      resolved = path.resolve(targetPath);
    } catch {
      return false;
    }
    const resolvedLower = resolved.toLowerCase();
    return listAuthorizedPaths().some((dir) => {
      const dirResolved = path.resolve(dir).toLowerCase();
      return (
        resolvedLower === dirResolved ||
        resolvedLower.startsWith(dirResolved + path.sep) ||
        resolvedLower.startsWith(dirResolved + '\\') ||
        resolvedLower.startsWith(dirResolved + '/')
      );
    });
  }

  listAuthorized(): string[] {
    return listAuthorizedPaths();
  }

  async revoke(path: string): Promise<void> {
    revokePath(path);
  }
}
