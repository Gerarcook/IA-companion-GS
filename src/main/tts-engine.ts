import path from 'node:path';
import { join } from 'node:path';
import axios from 'axios';
import crypto from 'node:crypto';
import { BrowserWindow, app } from 'electron';
import os from 'node:os';

export interface TtsOptions {
  voiceId?: string;
  speed?: number;
}

export class TtsEngine {
  private cacheDir: string;
  private apiKey: string;
  private referenceId: string | null;
  private model: string;

  constructor(
    private mainWindow: BrowserWindow,
    apiKey: string,
    referenceId: string | null,
    model?: string
  ) {
    this.apiKey = apiKey;
    this.referenceId = referenceId;
    this.model = model || '1.4-turbo-free';
    // Usar directorio de caché del sistema
    this.cacheDir = join(app.getPath('userData'), 'tts-cache');
  }

  async speak(text: string, opts: TtsOptions = {}): Promise<void> {
    const hash = crypto
      .createHash('md5')
      .update(text + JSON.stringify(opts))
      .digest('hex');
    const cachedPath = join(this.cacheDir, `${hash}.mp3`);

    if (await this.fileExists(cachedPath)) {
      this.playAudio(cachedPath);
      return;
    }

    const response = await axios.post(
      'https://api.fish.audio/v1/tts',
      {
        text,
        reference_id: this.referenceId,
        format: 'mp3',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'model': this.model,
        },
        responseType: 'arraybuffer',
      }
    );

    const buffer = Buffer.from(response.data);
    await this.ensureCacheDir();
    await this.writeFile(cachedPath, buffer);
    this.playAudio(cachedPath);
  }

  private playAudio(filePath: string) {
    this.mainWindow.webContents.send('tts:play', filePath);
  }

  private async fileExists(p: string): Promise<boolean> {
    try {
      const { stat } = await import('node:fs/promises');
      await stat(p);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureCacheDir() {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(this.cacheDir, { recursive: true });
  }

  private async writeFile(p: string, data: Buffer) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(p, data);
  }

  async cleanCache(maxAgeMs = 24 * 60 * 60 * 1000) {
    const { readdir, stat, unlink } = await import('node:fs/promises');
    try {
      const files = await readdir(this.cacheDir);
      const now = Date.now();
      for (const f of files) {
        const fp = join(this.cacheDir, f);
        const st = await stat(fp);
        if (now - st.mtimeMs > maxAgeMs) {
          await unlink(fp);
        }
      }
    } catch {}
  }
}