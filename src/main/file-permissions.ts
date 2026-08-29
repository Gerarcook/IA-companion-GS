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

  listAuthorized(): string[] {
    return listAuthorizedPaths();
  }

  async revoke(path: string): Promise<void> {
    revokePath(path);
  }
}