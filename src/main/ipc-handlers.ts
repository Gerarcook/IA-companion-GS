import { ipcMain, BrowserWindow, app } from 'electron';
import { OmniRouteClient, OmniRouteMessage } from './omniroute-client';
import { FilePermissions } from './file-permissions';
import {
  getSetting,
  setSetting,
  getTtsProviderConfig,
  setTtsProviderConfig,
  getActiveTtsProvider,
  setActiveTtsProvider
} from './db';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { TtsProviderRegistry, TtsProviderConfig } from './tts-providers';

export function registerIpcHandlers(mainWin: BrowserWindow) {
  const omniUrl = process.env.OMNIROUTE_URL ?? 'http://localhost:20128';
  const omniKey = process.env.OMNIROUTE_API_KEY ?? getSetting('omniroute_api_key') ?? '';
  const omniModel = process.env.OMNIROUTE_MODEL ?? 'omniroute/default';

  const omni = new OmniRouteClient(omniUrl, omniKey, omniModel);

  // Registro de proveedores TTS
  const ttsRegistry = new TtsProviderRegistry(mainWin);

  // Inicializar proveedor activo guardado
  const savedActiveProvider = getActiveTtsProvider();
  if (savedActiveProvider) {
    const savedConfig = getTtsProviderConfig(savedActiveProvider);
    if (savedConfig) {
      ttsRegistry.initializeProvider(savedActiveProvider, savedConfig).catch(err => {
        console.error(`Error inicializando proveedor TTS ${savedActiveProvider}:`, err);
      });
    }
    ttsRegistry.setActiveProvider(savedActiveProvider);
  } else {
    // Auto-configurar Fish Audio desde .env si no hay proveedor guardado
    const fishApiKey = process.env.FISH_API_KEY;
    const fishRefId = process.env.FISH_REFERENCE_ID;
    const fishModel = process.env.FISH_MODEL ?? 's2.1-pro-free';

    if (fishApiKey) {
      (async () => {
        try {
          await ttsRegistry.initializeProvider('fish-audio', {
            apiKey: fishApiKey,
            referenceId: fishRefId,
            model: fishModel,
          });
          ttsRegistry.setActiveProvider('fish-audio');
          setActiveTtsProvider('fish-audio');
          setTtsProviderConfig('fish-audio', { apiKey: fishApiKey, referenceId: fishRefId, model: fishModel });
          console.log('[TTS] Auto-configurado Fish Audio desde .env');
        } catch (err) {
          console.error('[TTS] Error auto-config Fish Audio:', err);
        }
      })();
    }
  }

  const filePerms = new FilePermissions(mainWin);

  // Directorio para guardar archivos de audio TTS
  const ttsDir = join(app.getPath('userData'), 'tts-audio');

  // Historial de conversación
  const conversationHistory: OmniRouteMessage[] = [
    { role: 'system', content: 'Eres ClawGs, un asistente IA útil y conversacional. Respondés en español rioplatense, con tono directo y buen humor.' }
  ];

  // Estado de conexión (simulado para REST)
  let connected = !!omniKey;

  const sendStatus = (conn: boolean) => {
    connected = conn;
    if (!mainWin.isDestroyed()) {
      mainWin.webContents.send('openclaw:status', { connected: conn });
    }
  };

  // Notificar conexión inicial
  if (connected) {
    setTimeout(() => sendStatus(true), 100);
  }

  ipcMain.handle('openclaw:retry', async () => {
    const key = getSetting('omniroute_api_key') ?? process.env.OMNIROUTE_API_KEY;
    if (key) {
      sendStatus(true);
      return { ok: true };
    }
    return { ok: false, error: 'Sin API key configurada' };
  });

  ipcMain.handle('openclaw:connect', async (_, token: string) => {
    try {
      setSetting('omniroute_api_key', token);
      omni.updateConfig(
        process.env.OMNIROUTE_URL ?? 'http://localhost:20128',
        token,
        process.env.OMNIROUTE_MODEL
      );
      sendStatus(true);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  });

  ipcMain.handle('openclaw:disconnect', async () => {
    sendStatus(false);
    return true;
  });

  ipcMain.handle('openclaw:is-connected', async () => {
    return connected;
  });

  ipcMain.handle('openclaw:send', async (_, { event, payload }: { event: string; payload: any }) => {
    if (!connected) {
      const key = getSetting('omniroute_api_key') ?? process.env.OMNIROUTE_API_KEY;
      if (key) {
        omni.updateConfig(
          process.env.OMNIROUTE_URL ?? 'http://localhost:20128',
          key,
          process.env.OMNIROUTE_MODEL
        );
        sendStatus(true);
      } else {
        throw new Error('No conectado. Configurá tu API key en ⚙.');
      }
    }

    if (event !== 'userMessage' || !payload?.text) {
      return { ok: false, error: 'Evento no soportado' };
    }

    // Agregar mensaje del usuario
    conversationHistory.push({ role: 'user', content: payload.text });

    try {
      // Llamar a omniroute
      const response = await omni.chat(conversationHistory, false);

      const reply = response.choices[0]?.message?.content ?? '';

      if (reply) {
        // Agregar respuesta al historial
        conversationHistory.push({ role: 'assistant', content: reply });

        // Enviar al renderer
        if (!mainWin.isDestroyed()) {
          mainWin.webContents.send('openclaw:message', {
            kind: 'message',
            payload: { text: reply }
          });
        }

        // TTS automático usando el proveedor activo (leer auto_tts en cada mensaje)
        const autoTtsEnabled = getSetting('auto_tts') === 'true';
        if (autoTtsEnabled) {
          try {
            const activeProvider = ttsRegistry.getActiveProvider();
            if (activeProvider) {
              const audioPath = await ttsRegistry.speak(reply);
              console.log(`TTS generado con ${activeProvider.name}: ${audioPath}`);
            }
          } catch (err) {
            console.error('Error en TTS:', err);
          }
        }
      }

      return { ok: true };
    } catch (err: any) {
      // Quitar mensaje user si falló
      conversationHistory.pop();
      throw new Error(err?.message ?? String(err));
    }
  });

  // TTS Providers IPC
  ipcMain.handle('tts:get-providers', async () => {
    return ttsRegistry.getAllProviders().map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      requiresApiKey: p.requiresApiKey,
      supportedModels: p.supportedModels,
      configFields: p.configFields,
    }));
  });

  ipcMain.handle('tts:get-active-provider', async () => {
    return ttsRegistry.getActiveProviderId();
  });

  ipcMain.handle('tts:set-active-provider', async (_, providerId: string) => {
    try {
      ttsRegistry.setActiveProvider(providerId);
      setActiveTtsProvider(providerId);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  });

  ipcMain.handle('tts:get-provider-config', async (_, providerId: string) => {
    return getTtsProviderConfig(providerId);
  });

  ipcMain.handle('tts:set-provider-config', async (_, providerId: string, config: TtsProviderConfig) => {
    try {
      await ttsRegistry.initializeProvider(providerId, config);
      setTtsProviderConfig(providerId, config);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  });

  ipcMain.handle('tts:speak', async (_, text: string, options?: Record<string, any>) => {
    try {
      const audioPath = await ttsRegistry.speak(text, options);
      return { ok: true, path: audioPath };
    } catch (err: any) {
      console.error('Error en TTS manual:', err);
      return { ok: false, error: String(err?.message ?? err) };
    }
  });

  ipcMain.handle('files:request-access', async () => {
    return await filePerms.requestDirectoryAccess();
  });

  ipcMain.handle('files:list-authorized', async () => {
    return filePerms.listAuthorized();
  });

  ipcMain.handle('files:revoke', async (_, path: string) => {
    await filePerms.revoke(path);
    return true;
  });

  // File selection and reading
  ipcMain.handle('files:select', async () => {
    const { dialog } = await import('electron');
    const result = await dialog.showOpenDialog(mainWin, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] },
        { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] },
        { name: 'Documentos', extensions: ['pdf', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] },
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] },
        { name: 'Todos los archivos', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePaths.length) return [];

    const { readFile } = await import('node:fs/promises');
    const files = [];

    for (const filePath of result.filePaths) {
      try {
        const buffer = await readFile(filePath);
        const base64 = buffer.toString('base64');
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        let mimeType = 'application/octet-stream';

        // MIME types básicos
        if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
        else if (ext === 'png') mimeType = 'image/png';
        else if (ext === 'gif') mimeType = 'image/gif';
        else if (ext === 'webp') mimeType = 'image/webp';
        else if (ext === 'pdf') mimeType = 'application/pdf';
        else if (['txt', 'md'].includes(ext)) mimeType = 'text/plain';
        else if (ext === 'mp4') mimeType = 'video/mp4';
        else if (ext === 'webm') mimeType = 'video/webm';
        else if (ext === 'mp3') mimeType = 'audio/mpeg';
        else if (ext === 'wav') mimeType = 'audio/wav';

        files.push({
          name: filePath.split(/[\\/]/).pop() || 'archivo',
          type: mimeType,
          size: buffer.length,
          dataUrl: `data:${mimeType};base64,${base64}`,
          path: filePath,
        });
      } catch (err) {
        console.error('Error leyendo archivo:', err);
      }
    }

    return files;
  });

  ipcMain.handle('files:read', async (_, filePath: string) => {
    const { readFile } = await import('node:fs/promises');
    const buffer = await readFile(filePath);
    const base64 = buffer.toString('base64');
    return base64;
  });

  ipcMain.handle('settings:get', async (_, key: string) => {
    return getSetting(key);
  });

  ipcMain.handle('settings:set', async (_, key: string, value: string) => {
    setSetting(key, value);
    if (key === 'omniroute_api_key') {
      omni.updateConfig(
        process.env.OMNIROUTE_URL ?? 'http://localhost:20128',
        value,
        process.env.OMNIROUTE_MODEL
      );
      sendStatus(true);
    }
    // auto_tts se lee al procesar cada mensaje, no necesita variable global
    return true;
  });

  ipcMain.handle('ui:toggle-chat', async () => {
    mainWin.webContents.send('ui:toggle-chat');
    return true;
  });
}