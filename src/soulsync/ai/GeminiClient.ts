/**
 * GeminiClient — thin wrapper around Google's Gemini 2.5 generateContent API.
 *
 * Auth model: user provides their own API key (stored locally in AsyncStorage).
 * This avoids any backend dependency for the personal/dev build.  For a
 * future production release this should be proxied through a backend so
 * keys aren't shipped to the client.
 */

const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

export const DEFAULT_MODEL = 'gemini-2.5-flash';

export interface GeminiPart { text: string }
export interface GeminiContent { role?: 'user' | 'model'; parts: GeminiPart[] }

export interface GeminiRequest {
  systemInstruction?: { parts: GeminiPart[] };
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: 'text/plain' | 'application/json';
  };
}

export interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  error?: { message?: string; status?: string };
}

export class GeminiClient {
  constructor(private apiKey: string, private model: string = DEFAULT_MODEL) {}

  /** Send a request and return the first candidate's combined text. */
  async generate(req: GeminiRequest, signal?: AbortSignal): Promise<string> {
    if (!this.apiKey) throw new Error('GEMINI_NO_KEY');

    const res = await fetch(ENDPOINT(this.model, this.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`GEMINI_HTTP_${res.status}: ${txt.slice(0, 200)}`);
    }

    const json: GeminiResponse = await res.json();
    if (json.error) throw new Error(`GEMINI_API: ${json.error.message ?? 'unknown'}`);

    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map(p => p.text ?? '').join('');
    if (!text) throw new Error('GEMINI_EMPTY_RESPONSE');
    return text;
  }
}
