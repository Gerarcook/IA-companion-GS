import axios, { AxiosError } from 'axios';
import { EventEmitter } from 'node:events';

export type OmniRouteContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

export interface OmniRouteMessage {
  role: 'user' | 'assistant' | 'system';
  content: OmniRouteContent;
}

export interface OmniRouteResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenRouterHeaders {
  referer?: string;
  title?: string;
}

export type OnDelta = (deltaText: string) => void;

export class ModelClient extends EventEmitter {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private isOpenRouter: boolean;
  private openRouterHeaders: OpenRouterHeaders;

  constructor(baseUrl: string, apiKey: string, model = 'omniroute/default') {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.model = model;
    // Detectar si es OpenRouter por la URL
    this.isOpenRouter = baseUrl.includes('openrouter.ai');
    this.openRouterHeaders = {
      referer: 'https://clawgs.local',
      title: 'ClawGS',
    };
  }

  setOpenRouterHeaders(headers: OpenRouterHeaders) {
    this.openRouterHeaders = { ...this.openRouterHeaders, ...headers };
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (this.isOpenRouter) {
      headers['HTTP-Referer'] = this.openRouterHeaders.referer || 'https://clawgs.local';
      headers['X-Title'] = this.openRouterHeaders.title || 'ClawGS';
    }

    return headers;
  }

  private extractError(err: unknown): string {
    const axiosErr = err as AxiosError<{ error?: { message?: string } }>;
    return (
      axiosErr?.response?.data?.error?.message ??
      (axiosErr?.response?.data as { message?: string } | undefined)?.message ??
      axiosErr?.message ??
      'Error desconocido'
    );
  }

  async chat(messages: OmniRouteMessage[], stream = false, onDelta?: OnDelta): Promise<OmniRouteResponse> {
    try {
      if (!stream || !onDelta) {
        const response = await axios.post<OmniRouteResponse>(
          `${this.baseUrl}/chat/completions`,
          { model: this.model, messages, stream: false },
          { headers: this.buildHeaders(), timeout: 120000 }
        );
        return response.data;
      }

      // Streaming SSE (compatible OpenAI)
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        { model: this.model, messages, stream: true },
        {
          headers: { ...this.buildHeaders(), Accept: 'text/event-stream' },
          timeout: 0,
          responseType: 'stream',
        }
      );

      let full = '';
      let finishReason = 'stop';
      let usage: OmniRouteResponse['usage'] | undefined;

      await new Promise<void>((resolve, reject) => {
        const streamData = response.data as NodeJS.ReadableStream;
        let buffer = '';

        streamData.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed?.error) {
                reject(new Error(parsed.error?.message ?? parsed.error));
                return;
              }
              const choice = parsed.choices?.[0];
              if (choice?.delta?.content) {
                full += choice.delta.content;
                onDelta(choice.delta.content as string);
              }
              if (choice?.finish_reason) finishReason = choice.finish_reason;
              if (parsed.usage) usage = parsed.usage;
            } catch {
              // Fragmento SSE inválido: ignorar
            }
          }
        });

        streamData.on('error', (err) => reject(err));
        streamData.on('end', () => resolve());
      });

      const assistant: OmniRouteResponse = {
        id: 'stream',
        choices: [{ message: { role: 'assistant', content: full }, finish_reason: finishReason }],
      };
      if (usage) assistant.usage = usage;
      return assistant;
    } catch (err) {
      throw new Error(this.extractError(err));
    }
  }

  /** Verifica que la conexión y el token sean válidos con una petición mínima real. */
  async verify(): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        },
        { headers: this.buildHeaders(), timeout: 20000 }
      );
    } catch (err) {
      throw new Error(this.extractError(err));
    }
  }

  updateConfig(baseUrl: string, apiKey: string, model?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.isOpenRouter = baseUrl.includes('openrouter.ai');
    if (model) this.model = model;
  }
}
