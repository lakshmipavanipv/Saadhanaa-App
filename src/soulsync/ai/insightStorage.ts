/**
 * insightStorage — AsyncStorage-backed cache for AI Insights results.
 *
 * Cache TTL: 12 hours. After that the AI Insights card will offer a
 * "Refresh insights" action. With Gemma running via Hugging Face's free
 * Inference API, we don't need to track an API key — it's all developer-side.
 *
 * Legacy: previously stored a user-supplied Gemini key. Those entries are
 * cleared on first load (best-effort) so the new key-less flow takes over.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { InsightResult } from './InsightGenerator';

const KEY_LAST_INSIGHT  = 'soulsync.gemma.lastInsight';
/** Legacy keys — cleared on first access. */
const LEGACY_KEY_GEMINI_KEY    = 'soulsync.gemini.apiKey';
const LEGACY_KEY_LAST_INSIGHT  = 'soulsync.gemini.lastInsight';
/** 24h TTL — keeps OpenRouter free-tier quota burn under 1 call/day per device. */
const TTL_MS = 24 * 60 * 60 * 1000;

/** Fire-and-forget cleanup of legacy Gemini storage entries. */
const cleanupLegacy = (): void => {
  AsyncStorage.removeItem(LEGACY_KEY_GEMINI_KEY).catch(() => {});
  AsyncStorage.removeItem(LEGACY_KEY_LAST_INSIGHT).catch(() => {});
};

export const insightStorage = {
  /** Returns cached result if fresh (<12 h). */
  async getCached(): Promise<InsightResult | null> {
    cleanupLegacy();
    const raw = await AsyncStorage.getItem(KEY_LAST_INSIGHT);
    if (!raw) return null;
    try {
      const r: InsightResult = JSON.parse(raw);
      if (!r.generatedAt || Date.now() - r.generatedAt > TTL_MS) return null;
      return r;
    } catch {
      return null;
    }
  },

  /** Always returns whatever was cached, regardless of age (UI fallback). */
  async getCachedAny(): Promise<InsightResult | null> {
    const raw = await AsyncStorage.getItem(KEY_LAST_INSIGHT);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  async setCached(result: InsightResult): Promise<void> {
    return AsyncStorage.setItem(KEY_LAST_INSIGHT, JSON.stringify(result));
  },

  async clearCache(): Promise<void> {
    return AsyncStorage.removeItem(KEY_LAST_INSIGHT);
  },
};
