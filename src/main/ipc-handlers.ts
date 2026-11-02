import { ipcMain, BrowserWindow, app } from 'electron';
import { ModelClient, OmniRouteMessage, OmniRouteContent } from './model-client';
import { FilePermissions } from './file-permissions';
import { setWindowMode, setPointerOverBubble, getWindowMode, syncWindowInteraction } from './window-manager';
import {
  getSetting,
  setSetting,
  getTtsProviderConfig,
  setTtsProviderConfig,
  getActiveTtsProvider,
  setActiveTtsProvider,
  saveChatMessage,
  getChatHistory,
  clearChatHistory,
} from './db';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { TtsProviderRegistry, TtsProviderConfig } from './tts-providers';

const DEFAULT_OMNI_URL = 'http://localhost:20128/v1';
const DEFAULT_OMNI_MODEL = 'omniroute/default';
const DEFAULT_SYSTEM_PROMPT =
  'Eres GS, el asistente de IA-companion-GS: util, directo y con buen humor. Respondés en español rioplatense, conciso y claro.';

interface OmniConfig {
  url: string;
  key: string;
  model: string;
}

/**
 * Resuelve la conexión al proveedor de modelos (cualquier endpoint compatible con OpenAI).
 * Orden: ajustes guardados en BD → LLM_* genérico → OMNIROUTE_* → OPENROUTER_* (alias) → default.
 */
function resolveOmniConfig(): OmniConfig {
  const url =
    getSetting('omniroute_url') ??
    process.env.LLM_URL ??
    process.env.OMNIROUTE_URL ??
    process.env.OPENROUTER_URL ??
    DEFAULT_OMNI_URL;
  const key =
    getSetting('omniroute_api_key') ??
    process.env.LLM_API_KEY ??
    process.env.OMNIROUTE_API_KEY ??
    process.env.OPENROUTER_API_KEY ??
    '';
  const model =
    getSetting('omniroute_model') ??
    process.env.LLM_MODEL ??
    process.env.OMNIROUTE_MODEL ??
    process.env.OPENROUTER_MODEL ??
    DEFAULT_OMNI_MODEL;
  return { url, key, model };
}

/** Extensión de archivos legibles como texto que pueden incluirse en el prompt */
const TEXTUAL_EXTENSIONS = ['txt', 'md', 'json', 'csv', 'log', 'yml', 'yaml', 'xml', 'ini', 'cfg'];

export function registerIpcHandlers(mainWin: BrowserWindow) {
  const config = resolveOmniConfig();
  const omni = new ModelClient(config.url, config.key, config.model);

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

  // Historial de conversación en memoria (sesión actual)
  let conversationHistory: OmniRouteMessage[] = [
    { role: 'system', content: getSetting('system_prompt') ?? DEFAULT_SYSTEM_PROMPT },
  ];

  // Estado de conexión: true solo tras una verificación real
  let connected = false;
  let lastError: string | null = null;

  const sendStatus = (conn: boolean, error?: string | null) => {
    connected = conn;
    lastError = conn ? null : (error ?? lastError);
    if (!mainWin.isDestroyed()) {
      mainWin.webContents.send('openclaw:status', { connected: conn, error: lastError });
    }
  };

  /** Proveedores locales que pueden funcionar sin API key (Ollama, LM Studio...). */
  const isLocalUrl = (url: string): boolean => /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(url);

  /**
   * Aplica la config guardada y verifica de verdad contra el proveedor.
   * Es la única fuente de verdad del estado ONLINE/OFFLINE.
   */
  async function refreshConnection(): Promise<{ ok: boolean; error?: string }> {
    const cfg = resolveOmniConfig();
    if (!cfg.key && !isLocalUrl(cfg.url)) {
      const msg = 'Sin API key configurada (⚙ › SISTEMA)';
      sendStatus(false, msg);
      return { ok: false, error: msg };
    }
    omni.updateConfig(cfg.url, cfg.key, cfg.model);
    try {
      await omni.verify();
      sendStatus(true);
      return { ok: true };
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      sendStatus(false, msg);
      console.error('[conn] Verificación fallida:', msg, '| url:', cfg.url, '| model:', cfg.model);
      return { ok: false, error: msg };
    }
  }

  // Al iniciar: verificar con la config guardada (no asumir ONLINE solo por tener key)
  void refreshConnection();

  /**
   * Traduce adjuntos del renderer a contenido multimodal compatible OpenAI.
   * - Imágenes → image_url (data URL base64)
   * - Texto plano (txt/md/json/...) → incluido como texto
   * - Otros adjuntos → listados con tamaño (el modelo no los lee)
   */
  function buildUserContent(text: string, attachments?: any[]): OmniRouteContent {
    if (!attachments || attachments.length === 0) return text;

    const parts: NonNullable<OmniRouteContent> = [];
    const textChunks: string[] = [text];
    const notes: string[] = [];

    for (const att of attachments) {
      const name = att?.name ?? 'archivo';
      const type = att?.type ?? '';
      const ext = String(name).split('.').pop()?.toLowerCase() ?? '';

      if (type.startsWith('image/')) {
        parts.push({ type: 'image_url', image_url: { url: att.dataUrl } });
      } else if (type === 'text/plain' || TEXTUAL_EXTENSIONS.includes(ext)) {
        try {
          const decoded = Buffer.from(String(att.dataUrl).split(',')[1] ?? '', 'base64').toString('utf8');
          textChunks.push(`--- Archivo adjunto "${name}" ---\n${decoded.slice(0, 200_000)}`);
        } catch {
          notes.push(`${name} (no se pudo leer)`);
        }
      } else {
        notes.push(`${name} (${type || 'desconocido'}, no soportado para lectura)`);
      }
    }

    if (notes.length > 0) {
      textChunks.push(`(Adjuntos no legibles: ${notes.join(', ')})`);
    }

    const result: OmniRouteContent = [];
    const mainText = textChunks.join('\n\n').trim();
    if (mainText) result.push({ type: 'text', text: mainText });
    result.push(...parts);
    return result;
  }

  // ---------- Conexión ----------

  ipcMain.handle('openclaw:retry', async () => {
    const cfg = resolveOmniConfig();
    if (!cfg.key && !isLocalUrl(cfg.url)) {
      sendStatus(false, 'Sin API key configurada (⚙ › SISTEMA)');
      return { ok: false, error: 'Sin API key configurada (⚙ › SISTEMA)' };
    }
    const result = await refreshConnection();
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  });

  ipcMain.handle(
    'openclaw:connect',
    async (_, payload: { token: string; url?: string; model?: string } | string) => {
      try {
        const isObj = typeof payload === 'object' && payload !== null;
        const token = (isObj ? payload.token : payload) ?? '';
        const cfg = resolveOmniConfig();
        const url = (isObj && payload.url) || cfg.url;
        const model = (isObj && payload.model) || cfg.model;

        if (!token.trim()) {
          sendStatus(false);
          return { ok: false, error: 'Token vacío' };
        }

        setSetting('omniroute_api_key', token);
        if (isObj && payload.url) setSetting('omniroute_url', payload.url);
        if (isObj && payload.model) setSetting('omniroute_model', payload.model);

        omni.updateConfig(url, token, model);

        // Verificación real contra el gateway
        await omni.verify();
        sendStatus(true);
        return { ok: true };
      } catch (err: any) {
        sendStatus(false);
        return { ok: false, error: String(err?.message ?? err) };
      }
    }
  );

  ipcMain.handle('openclaw:disconnect', async () => {
    sendStatus(false);
    return true;
  });

  ipcMain.handle('openclaw:is-connected', async () => {
    return connected;
  });

  ipcMain.handle('openclaw:last-error', async () => {
    return lastError;
  });

  // ---------- Chat ----------

  ipcMain.handle('openclaw:send', async (_, { event, payload }: { event: string; payload: any }) => {
    if (!connected) {
      // Intento de reconexión automática con la config guardada
      const cfg = resolveOmniConfig();
      if (!cfg.key && !isLocalUrl(cfg.url)) {
        throw new Error('Sin API key. Configurá tu proveedor en ⚙ › SISTEMA.');
      }
      const result = await refreshConnection();
      if (!result.ok) {
        throw new Error(`Sin conexión al proveedor: ${result.error ?? 'error desconocido'}`);
      }
    }

    if (event !== 'userMessage' || !payload?.text) {
      return { ok: false, error: 'Evento no soportado' };
    }

    // Persona editable; sincronizar si cambió
    const systemPrompt = getSetting('system_prompt') ?? DEFAULT_SYSTEM_PROMPT;
    if (!conversationHistory.length || conversationHistory[0]?.content !== systemPrompt) {
      conversationHistory = [{ role: 'system', content: systemPrompt }, ...conversationHistory.filter(m => m.role !== 'system')];
    }

    // Agregar mensaje del usuario (con adjuntos multimodales)
    const userContent = buildUserContent(payload.text, payload.attachments);
    conversationHistory.push({ role: 'user', content: userContent });

    // Persistir texto plano del usuario (con nombres de adjuntos)
    const attachmentNames = (payload.attachments ?? []).map((a: any) => a?.name).filter(Boolean);
    const persistedUser = attachmentNames.length
      ? `${payload.text}\n📎 Adjuntos: ${attachmentNames.join(', ')}`
      : payload.text;

    try {
      // Streaming: deltas en tiempo real al renderer
      const response = await omni.chat(conversationHistory, true, (delta) => {
        if (!mainWin.isDestroyed()) {
          mainWin.webContents.send('openclaw:delta', { text: delta });
        }
      });

      const reply = response.choices[0]?.message?.content ?? '';

      if (reply) {
        conversationHistory.push({ role: 'assistant', content: reply });
        saveChatMessage('user', persistedUser);
        saveChatMessage('assistant', reply);

        if (!mainWin.isDestroyed()) {
          mainWin.webContents.send('openclaw:message', {
            kind: 'message',
            payload: { text: reply },
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

  // ---------- Historial persistente ----------

  ipcMain.handle('chat:get-history', async () => {
    return getChatHistory(100);
  });

  ipcMain.handle('chat:clear', async () => {
    clearChatHistory();
    conversationHistory = [{ role: 'system', content: getSetting('system_prompt') ?? DEFAULT_SYSTEM_PROMPT }];
    return true;
  });

  // ---------- TTS Providers ----------

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

  // ---------- Archivos ----------

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
        { name: 'Documentos', extensions: ['pdf', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] },
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] },
        { name: 'Todos los archivos', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePaths.length) return [];

    const { readFile } = await import('node:fs/promises');
    const files: Array<Record<string, unknown>> = [];

    for (const filePath of result.filePaths) {
      try {
        // Seguridad: solo leer dentro de carpetas autorizadas
        if (!filePerms.isWithinAuthorized(filePath)) {
          console.warn(`[files] Lectura denegada fuera de carpetas autorizadas: ${filePath}`);
          continue;
        }
        const buffer = await readFile(filePath);
        const base64 = buffer.toString('base64');
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        let mimeType = 'application/octet-stream';

        // MIME types básicos
        if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
        else if (ext === 'png') mimeType = 'image/png';
        else if (ext === 'gif') mimeType = 'image/gif';
        else if (ext === 'webp') mimeType = 'image/webp';
        else if (ext === 'bmp') mimeType = 'image/bmp';
        else if (ext === 'pdf') mimeType = 'application/pdf';
        else if (['txt', 'md', 'json', 'csv', 'log', 'yml', 'yaml', 'xml', 'ini', 'cfg'].includes(ext))
          mimeType = 'text/plain';
        else if (ext === 'mp3') mimeType = 'audio/mpeg';
        else if (ext === 'wav') mimeType = 'audio/wav';
        else if (ext === 'ogg') mimeType = 'audio/ogg';
        else if (ext === 'flac') mimeType = 'audio/flac';
        else if (ext === 'm4a') mimeType = 'audio/mp4';

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
    // Seguridad: solo dentro de carpetas autorizadas
    if (!filePerms.isWithinAuthorized(filePath)) {
      throw new Error('Acceso denegado: la carpeta no está autorizada en ⚙ › Datos');
    }
    const { readFile } = await import('node:fs/promises');
    const buffer = await readFile(filePath);
    const base64 = buffer.toString('base64');
    return base64;
  });

  // Guardar audio TTS en disco (si se necesita persistir)
  ipcMain.handle('tts:save-audio', async (_, dataUrl: string, fileName: string) => {
    try {
      await mkdir(ttsDir, { recursive: true });
      const base64 = String(dataUrl).split(',')[1] ?? '';
      const safeName = fileName.replace(/[^\w.\-]/g, '_') || `audio_${Date.now()}.mp3`;
      const filePath = join(ttsDir, safeName);
      await writeFile(filePath, Buffer.from(base64, 'base64'));
      return { ok: true, path: filePath };
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  });

  // ---------- Ajustes ----------

  ipcMain.handle('settings:get', async (_, key: string) => {
    return getSetting(key);
  });

  ipcMain.handle('settings:set', async (_, key: string, value: string) => {
    setSetting(key, value);
    // Aplicar cambios de conexión al cliente al vuelo
    if (key === 'omniroute_url' || key === 'omniroute_model') {
      const cfg = resolveOmniConfig();
      omni.updateConfig(cfg.url, cfg.key, cfg.model);
    }
    if (key === 'system_prompt') {
      const sys = getSetting('system_prompt') ?? DEFAULT_SYSTEM_PROMPT;
      if (conversationHistory[0]?.role === 'system') conversationHistory[0] = { role: 'system', content: sys };
      else conversationHistory.unshift({ role: 'system', content: sys });
    }
    return true;
  });

  // ---------- UI ----------

  ipcMain.handle('ui:toggle-chat', async () => {
    if (mainWin.isVisible()) mainWin.hide();
    else {
      mainWin.show();
      mainWin.focus();
    }
    return true;
  });

  // Cambiar tamaño de la ventana según el modo (burbuja / chat / expandido)
  ipcMain.handle('window:set-mode', async (_e, mode: string) => {
    if (mode === 'bubble' || mode === 'chat' || mode === 'expanded') {
      setWindowMode(mainWin, mode);
    }
    return getWindowMode();
  });

  ipcMain.handle('window:get-mode', async () => {
    return getWindowMode();
  });

  // El renderer avisa si el puntero está sobre la burbuja (click-through en modo burbuja)
  ipcMain.handle('window:pointer', async (_e, over: boolean) => {
    setPointerOverBubble(mainWin, !!over);
    return true;
  });
}
