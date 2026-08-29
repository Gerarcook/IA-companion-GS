import axios from 'axios';
import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { app } from 'electron';
import crypto from 'node:crypto';
import { writeFile, mkdir, stat, readdir, unlink } from 'node:fs/promises';

export interface TtsOptions {
  voiceId?: string;
  speed?: number;
  referenceId?: string;
  model?: string;
}

export interface TtsProviderConfig {
  apiKey?: string;
  referenceId?: string;
  model?: string;
  voiceId?: string;
  speed?: number;
  baseUrl?: string;
  stability?: number;
  similarityBoost?: number;
  [key: string]: any;
}

export interface TtsProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly requiresApiKey: boolean;
  readonly supportedModels?: string[];
  readonly configFields: TtsConfigField[];

  initialize(config: TtsProviderConfig): Promise<void>;
  speak(text: string, options?: TtsOptions): Promise<string>; // returns audio file path
  cleanup?(): Promise<void>;
  validateConfig(config: TtsProviderConfig): { valid: boolean; errors: string[] };
}

export interface TtsConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select' | 'number';
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  default?: string | number;
  description?: string;
}

export abstract class BaseTtsProvider implements TtsProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly requiresApiKey: boolean;
  abstract readonly configFields: TtsConfigField[];
  protected config: TtsProviderConfig = {};
  protected mainWindow: BrowserWindow;
  protected cacheDir: string;

  constructor(mainWindow: BrowserWindow, providerId: string) {
    this.mainWindow = mainWindow;
    this.cacheDir = join(app.getPath('userData'), 'tts-cache', providerId);
  }

  async initialize(config: TtsProviderConfig): Promise<void> {
    this.config = config;
    await this.ensureCacheDir();
  }

  abstract speak(text: string, options?: TtsOptions): Promise<string>;

  async cleanup(): Promise<void> {}

  validateConfig(config: TtsProviderConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    for (const field of this.configFields) {
      if (field.required && (!config[field.key] || String(config[field.key]).trim() === '')) {
        errors.push(`${field.label} es requerido`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  protected async ensureCacheDir(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
  }

  protected getCachePath(text: string, options: TtsOptions = {}): string {
    const hash = crypto
      .createHash('md5')
      .update(text + JSON.stringify(options) + JSON.stringify(this.config))
      .digest('hex');
    return join(this.cacheDir, `${hash}.mp3`);
  }

  protected async fileExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  protected async writeCache(path: string, buffer: Buffer): Promise<void> {
    await writeFile(path, buffer);
  }

  protected async playAudio(filePath: string): Promise<void> {
    // Leer archivo y enviar como base64 data URL para evitar problemas de file://
    try {
      const { readFile } = await import('node:fs/promises');
      const buffer = await readFile(filePath);
      const base64 = buffer.toString('base64');
      const dataUrl = `data:audio/mpeg;base64,${base64}`;
      this.mainWindow.webContents.send('tts:play', dataUrl);
    } catch (err) {
      console.error('[TTS] Error reading audio file for base64:', err);
    }
  }

  protected async cleanCache(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
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

export class FishAudioProvider extends BaseTtsProvider {
  readonly id = 'fish-audio';
  readonly name = 'Fish Audio';
  readonly description = 'TTS de alta calidad con clonación de voz (reference_id)';
  readonly requiresApiKey = true;
  readonly supportedModels = ['s2.1-pro-free', 's2.1-pro', 's1.5', '1.4-turbo-free'];

  constructor(mainWindow: BrowserWindow) {
    super(mainWindow, 'fish-audio');
  }

  readonly configFields: TtsConfigField[] = [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      placeholder: 'sk-fish-...',
      description: 'Tu API key de Fish Audio (https://fish.audio)'
    },
    {
      key: 'referenceId',
      label: 'Reference ID (Voz clonada)',
      type: 'text',
      required: false,
      placeholder: 'a728b3e3bda3425799f0555792b463ff',
      description: 'ID de la voz clonada. Dejar vacío para voces por defecto.'
    },
    {
      key: 'model',
      label: 'Modelo',
      type: 'select',
      required: false,
      default: 's2.1-pro-free',
      options: [
        { value: 's2.1-pro-free', label: 'S2.1 Pro (Gratis)' },
        { value: 's2.1-pro', label: 'S2.1 Pro (Pago)' },
        { value: 's1.5', label: 'S1.5' },
        { value: '1.4-turbo-free', label: '1.4 Turbo (Gratis)' },
      ],
      description: 'Modelo de síntesis a usar'
    },
    {
      key: 'speed',
      label: 'Velocidad',
      type: 'number',
      required: false,
      default: 1.0,
      description: 'Velocidad de habla (0.5 - 2.0)'
    },
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      required: false,
      default: 'https://api.fish.audio',
      description: 'URL base de la API (para self-hosted o proxies)'
    }
  ];

  async speak(text: string, options: TtsOptions = {}): Promise<string> {
    const cachePath = this.getCachePath(text, options);

    if (await this.fileExists(cachePath)) {
      await this.playAudio(cachePath);
      return cachePath;
    }

    const referenceId = options.referenceId ?? this.config.referenceId;
    const model = options.model ?? this.config.model ?? 's2.1-pro-free';
    const speed = options.speed ?? this.config.speed ?? 1.0;
    const baseUrl = this.config.baseUrl ?? 'https://api.fish.audio';

    const response = await axios.post(
      `${baseUrl}/v1/tts`,
      {
        text,
        reference_id: referenceId,
        format: 'mp3',
        speed,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'model': model,
        },
        responseType: 'arraybuffer',
        timeout: 60000,
      }
    );

    const buffer = Buffer.from(response.data);
    await this.writeCache(cachePath, buffer);
    this.playAudio(cachePath);
    return cachePath;
  }
}

export class OpenAiTtsProvider extends BaseTtsProvider {
  readonly id = 'openai-tts';
  readonly name = 'OpenAI TTS';
  readonly description = 'Síntesis de voz de OpenAI (tts-1, tts-1-hd)';
  readonly requiresApiKey = true;
  readonly supportedModels = ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'];

  constructor(mainWindow: BrowserWindow) {
    super(mainWindow, 'openai-tts');
  }

  readonly configFields: TtsConfigField[] = [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      placeholder: 'sk-...',
      description: 'Tu API key de OpenAI'
    },
    {
      key: 'model',
      label: 'Modelo',
      type: 'select',
      required: false,
      default: 'tts-1',
      options: [
        { value: 'tts-1', label: 'TTS-1 (Estándar)' },
        { value: 'tts-1-hd', label: 'TTS-1 HD (Alta calidad)' },
        { value: 'gpt-4o-mini-tts', label: 'GPT-4o Mini TTS' },
      ]
    },
    {
      key: 'voice',
      label: 'Voz',
      type: 'select',
      required: false,
      default: 'alloy',
      options: [
        { value: 'alloy', label: 'Alloy' },
        { value: 'echo', label: 'Echo' },
        { value: 'fable', label: 'Fable' },
        { value: 'onyx', label: 'Onyx' },
        { value: 'nova', label: 'Nova' },
        { value: 'shimmer', label: 'Shimmer' },
      ]
    },
    {
      key: 'speed',
      label: 'Velocidad',
      type: 'number',
      required: false,
      default: 1.0,
      description: 'Velocidad de habla (0.25 - 4.0)'
    },
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      required: false,
      default: 'https://api.openai.com',
      description: 'URL base (para proxies compatibles)'
    }
  ];

  async speak(text: string, options: TtsOptions = {}): Promise<string> {
    const cachePath = this.getCachePath(text, options);

    if (await this.fileExists(cachePath)) {
      await this.playAudio(cachePath);
      return cachePath;
    }

    const voice = options.voiceId ?? this.config.voice ?? 'alloy';
    const model = options.model ?? this.config.model ?? 'tts-1';
    const speed = options.speed ?? this.config.speed ?? 1.0;
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com';

    const response = await axios.post(
      `${baseUrl}/v1/audio/speech`,
      {
        model,
        input: text,
        voice,
        response_format: 'mp3',
        speed,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        responseType: 'arraybuffer',
        timeout: 60000,
      }
    );

    const buffer = Buffer.from(response.data);
    await this.writeCache(cachePath, buffer);
    this.playAudio(cachePath);
    return cachePath;
  }
}

export class ElevenLabsProvider extends BaseTtsProvider {
  readonly id = 'elevenlabs';
  readonly name = 'ElevenLabs';
  readonly description = 'Síntesis de voz ultra-realista con miles de voces';
  readonly requiresApiKey = true;

  constructor(mainWindow: BrowserWindow) {
    super(mainWindow, 'elevenlabs');
  }

  readonly configFields: TtsConfigField[] = [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      placeholder: 'sk_...',
      description: 'Tu API key de ElevenLabs'
    },
    {
      key: 'voiceId',
      label: 'Voice ID',
      type: 'text',
      required: true,
      placeholder: '21m00Tcm4TlvDq8ikWAM',
      description: 'ID de la voz a usar (de tu biblioteca o marketplace)'
    },
    {
      key: 'model',
      label: 'Modelo',
      type: 'select',
      required: false,
      default: 'eleven_multilingual_v2',
      options: [
        { value: 'eleven_multilingual_v2', label: 'Multilingual v2 (Recomendado)' },
        { value: 'eleven_monolingual_v1', label: 'Monolingual v1 (Solo inglés)' },
        { value: 'eleven_turbo_v2', label: 'Turbo v2 (Rápido)' },
      ]
    },
    {
      key: 'stability',
      label: 'Estabilidad',
      type: 'number',
      required: false,
      default: 0.5,
      description: '0.0 (variable) - 1.0 (consistente)'
    },
    {
      key: 'similarityBoost',
      label: 'Similarity Boost',
      type: 'number',
      required: false,
      default: 0.75,
      description: '0.0 - 1.0 (qué tan parecido a la voz original)'
    },
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      required: false,
      default: 'https://api.elevenlabs.io',
      description: 'URL base de la API'
    }
  ];

  async speak(text: string, options: TtsOptions = {}): Promise<string> {
    const cachePath = this.getCachePath(text, options);

    if (await this.fileExists(cachePath)) {
      await this.playAudio(cachePath);
      return cachePath;
    }

    const voiceId = options.voiceId ?? this.config.voiceId;
    const model = options.model ?? this.config.model ?? 'eleven_multilingual_v2';
    const stability = this.config.stability ?? 0.5;
    const similarityBoost = this.config.similarityBoost ?? 0.75;
    const baseUrl = this.config.baseUrl ?? 'https://api.elevenlabs.io';

    const response = await axios.post(
      `${baseUrl}/v1/text-to-speech/${voiceId}`,
      {
        text,
        model_id: model,
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.config.apiKey,
          'Accept': 'audio/mpeg',
        },
        responseType: 'arraybuffer',
        timeout: 60000,
      }
    );

    const buffer = Buffer.from(response.data);
    await this.writeCache(cachePath, buffer);
    this.playAudio(cachePath);
    return cachePath;
  }
}

export class TtsProviderRegistry {
  private providers: Map<string, TtsProvider> = new Map();
  private activeProviderId: string | null = null;
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register(new FishAudioProvider(this.mainWindow));
    this.register(new OpenAiTtsProvider(this.mainWindow));
    this.register(new ElevenLabsProvider(this.mainWindow));
  }

  register(provider: TtsProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): TtsProvider | undefined {
    return this.providers.get(id);
  }

  getAllProviders(): TtsProvider[] {
    return Array.from(this.providers.values());
  }

  setActiveProvider(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`Proveedor TTS no encontrado: ${id}`);
    }
    this.activeProviderId = id;
  }

  getActiveProvider(): TtsProvider | null {
    if (!this.activeProviderId) return null;
    return this.providers.get(this.activeProviderId) ?? null;
  }

  getActiveProviderId(): string | null {
    return this.activeProviderId;
  }

  async initializeProvider(id: string, config: TtsProviderConfig): Promise<void> {
    const provider = this.getProvider(id);
    if (!provider) throw new Error(`Proveedor no encontrado: ${id}`);

    const validation = provider.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Configuración inválida: ${validation.errors.join(', ')}`);
    }

    await provider.initialize(config);
  }

  async speak(text: string, options?: TtsOptions): Promise<string> {
    const provider = this.getActiveProvider();
    if (!provider) {
      throw new Error('No hay proveedor TTS activo configurado');
    }
    return await provider.speak(text, options);
  }

  async cleanup(): Promise<void> {
    for (const provider of this.providers.values()) {
      await provider.cleanup?.();
    }
  }
}