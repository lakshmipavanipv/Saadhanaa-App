/**
 * GemmaClient — wrapper around OpenRouter's chat completions endpoint,
 * routed to Google's open-source Gemma 2/3 models.
 *
 * Why OpenRouter instead of HF Inference?
 *   • CORS-friendly — works from React Native web.
 *   • Free tier covers Gemma models (no payment / credit card needed).
 *   • OpenAI-compatible API — clean, well-documented.
 *   • Single developer key, baked in via EXPO_PUBLIC_OPENROUTER_KEY.
 *     End-users never see a key prompt.
 *
 * Setup (one-time, developer-side):
 *   1. Sign up free at https://openrouter.ai
 *   2. Get a key at https://openrouter.ai/keys
 *   3. Add to .env:  EXPO_PUBLIC_OPENROUTER_KEY=sk-or-v1-...
 *   4. Restart `npx expo start`
 */

import Constants from 'expo-constants';

// ─── Configuration ─────────────────────────────────────────────────

/** Free-tier models on OpenRouter, ordered by preference. The :free suffix is required. */
export const GEMMA_3N_E4B   = 'google/gemma-3n-e4b-it:free';
export const GEMMA_3N_E2B   = 'google/gemma-3n-e2b-it:free';
export const GEMMA_2_9B     = 'google/gemma-2-9b-it:free';
export const LLAMA_3_3_70B  = 'meta-llama/llama-3.3-70b-instruct:free';

/** Default — Gemma 3n E4B is currently the most reliable free Gemma on OpenRouter. */
export const DEFAULT_MODEL = GEMMA_3N_E4B;

/** Fallback chain if the primary model returns 404 or 429. */
const FALLBACK_MODELS = [GEMMA_3N_E2B, GEMMA_2_9B, LLAMA_3_3_70B];

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Developer-baked OpenRouter key. Pulled from Expo's `extra` config or
 * an EXPO_PUBLIC_* env var. NEVER asked from the end user.
 */
const OPENROUTER_KEY: string | undefined =
  (Constants.expoConfig?.extra as any)?.openrouterKey ??
  (process.env as any)?.EXPO_PUBLIC_OPENROUTER_KEY ??
  undefined;

/** Optional — shown to OpenRouter in the leaderboard headers (no effect on requests). */
const APP_REFERER = 'https://github.com/lakshmipavanipv/Saadhanaa-App';
const APP_TITLE   = 'Saadhanaa';

// ─── Types ─────────────────────────────────────────────────────────

export interface GemmaParams {
  temperature?: number;
  max_new_tokens?: number;
  top_p?: number;
}

export interface GemmaRequest {
  systemPrompt?: string;
  userMessage: string;
  params?: GemmaParams;
  model?: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { role: string; content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string; code?: number | string };
}

// ─── Client ────────────────────────────────────────────────────────

export class GemmaClient {
  constructor(private model: string = DEFAULT_MODEL) {}

  /** Try one model; throws on failure. */
  private async tryModel(model: string, req: GemmaRequest, signal?: AbortSignal): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    if (req.systemPrompt) {
      messages.push({ role: 'system', content: req.systemPrompt });
    }
    messages.push({ role: 'user', content: req.userMessage });

    const body = JSON.stringify({
      model,
      messages,
      temperature: req.params?.temperature ?? 0.7,
      max_tokens: req.params?.max_new_tokens ?? 1024,
      top_p: req.params?.top_p ?? 0.95,
    });

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': APP_REFERER,
        'X-Title': APP_TITLE,
      },
      body,
      signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      if (res.status === 401) throw new Error(`GEMMA_HTTP_401: OpenRouter key rejected`);
      if (res.status === 402) throw new Error(`GEMMA_HTTP_402: Free-tier credit exhausted`);
      if (res.status === 404) throw new Error(`GEMMA_HTTP_404: Model ${model} not available`);
      if (res.status === 429) throw new Error(`GEMMA_HTTP_429: Rate limit reached for ${model}`);
      if (res.status === 503) throw new Error(`GEMMA_HTTP_503: ${model} temporarily unavailable`);
      throw new Error(`GEMMA_HTTP_${res.status}: ${txt.slice(0, 200)}`);
    }

    const json: ChatCompletionResponse = await res.json();
    if (json.error) throw new Error(`GEMMA_API: ${json.error.message ?? 'unknown'}`);

    const text = json.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) throw new Error('GEMMA_EMPTY_RESPONSE');
    return text;
  }

  /**
   * Generate with automatic fallback through a chain of free models.
   * If the primary model returns 404/429/503, falls back to the next available.
   */
  async generate(req: GemmaRequest, signal?: AbortSignal): Promise<string> {
    if (!OPENROUTER_KEY) {
      throw new Error(
        'GEMMA_NO_KEY: EXPO_PUBLIC_OPENROUTER_KEY missing. ' +
        'Get a free key at openrouter.ai/keys and add it to .env'
      );
    }

    const chain = req.model ? [req.model] : [this.model, ...FALLBACK_MODELS];
    let lastErr: Error | null = null;

    for (const model of chain) {
      try {
        return await this.tryModel(model, req, signal);
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message ?? '');
        // Only fall back on availability errors — fail fast on auth/payment errors
        if (msg.includes('GEMMA_HTTP_404') || msg.includes('GEMMA_HTTP_429') || msg.includes('GEMMA_HTTP_503')) {
          console.warn(`[Gemma] ${model} failed (${msg.slice(0, 60)}), trying next...`);
          continue;
        }
        throw e;   // 401/402/network/etc — surface immediately
      }
    }
    throw lastErr ?? new Error('GEMMA_ALL_MODELS_FAILED');
  }
}

export const defaultGemmaClient = new GemmaClient();
