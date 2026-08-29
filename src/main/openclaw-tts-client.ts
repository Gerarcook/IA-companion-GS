import axios from 'axios';

export class OpenClawTtsClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async generateTts(text: string): Promise<Buffer | null> {
    try {
      // Llamar al endpoint de TTS de OpenClaw
      const response = await axios.post(
        `${this.baseUrl}/v1/tts`,
        { text },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 30000, // 30 segundos
        }
      );

      if (response.data && response.data.byteLength > 0) {
        return Buffer.from(response.data);
      }

      return null;
    } catch (err: any) {
      console.error('[OpenClaw TTS] Error:', err?.message ?? err);
      throw err;
    }
  }

  updateConfig(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }
}
