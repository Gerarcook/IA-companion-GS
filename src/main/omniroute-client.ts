import axios, { AxiosError } from 'axios';
import { EventEmitter } from 'node:events';

export interface OmniRouteMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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

export class OmniRouteClient extends EventEmitter {
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

  async chat(messages: OmniRouteMessage[], stream = false): Promise<OmniRouteResponse> {
    try {
      const response = await axios.post<OmniRouteResponse>(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages,
          stream,
        },
        {
          headers: this.buildHeaders(),
          timeout: 120000,
        }
      );

      return response.data;
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: { message?: string } }>;
      const msg = axiosErr.response?.data?.error?.message
        ?? axiosErr.message
        ?? 'Error desconocido';
      throw new Error(msg);
    }
  }

  updateConfig(baseUrl: string, apiKey: string, model?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.isOpenRouter = baseUrl.includes('openrouter.ai');
    if (model) this.model = model;
  }
}