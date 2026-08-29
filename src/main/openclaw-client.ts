import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

export interface OpenClawMessage {
  kind: string;
  payload: any;
}

export class OpenClawClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private token: string;
  private reconnectAttempts = 0;
  private readonly MAX_RETRIES = 5;
  private readonly BASE_URL = process.env.OPENCLAW_WS_URL || 'ws://localhost:20128';
  private retryTimer: NodeJS.Timeout | null = null;
  private failed = false;

  constructor(token: string) {
    super();
    this.token = token;
  }

  connect() {
    if (this.failed) {
      // No reintentamos si ya falló definitivamente.
      return;
    }

    const url = `${this.BASE_URL}?token=${encodeURIComponent(this.token)}`;
    try {
      this.ws = new WebSocket(url);
    } catch (err: any) {
      this.emit('error', err);
      return;
    }

    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.emit('open');
    });

    this.ws.on('message', (data) => {
      try {
        const msg: OpenClawMessage = JSON.parse(data.toString());
        this.emit('message', msg);
      } catch (e) {
        console.error('[OpenClaw] Invalid JSON:', data);
      }
    });

    this.ws.on('close', (code, reason) => {
      this.emit('close', { code, reason: reason.toString() });
      if (!this.failed) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (err: any) => {
      // Errores de DNS / red no se recuperan: cortamos los reintentos.
      const code = err?.code || err?.message || '';
      const fatal = /ENOTFOUND|ENETUNREACH|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|Invalid URI/i.test(
        String(code)
      );
      this.emit('error', err);
      if (fatal) {
        this.failed = true;
        this.emit('failed', `Error de red: ${err.message ?? err}`);
      }
    });
  }

  private scheduleReconnect() {
    if (this.retryTimer) return;
    if (this.reconnectAttempts >= this.MAX_RETRIES) {
      this.failed = true;
      this.emit('failed', 'max retries reached');
      return;
    }
    const delay = Math.min(30_000, 2 ** this.reconnectAttempts * 1000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  retry() {
    this.reconnectAttempts = 0;
    this.failed = false;
    this.connect();
  }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  send(event: string, payload: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(JSON.stringify({ kind: event, payload }));
  }

  disconnect() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.failed = false;
    this.reconnectAttempts = 0;
    this.ws?.close();
    this.ws = null;
  }

  updateToken(newToken: string) {
    this.token = newToken;
  }
}
