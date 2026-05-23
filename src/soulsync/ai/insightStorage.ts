/**
 * insightStorage — AsyncStorage-backed cache for Gemini API key + last result.
 *
 * Cache TTL: 12 hours. After that the AI Insights card will offer a
 * "Refresh insights" action. This keeps quota usage bounded for the
 * default Gemini free tier (1500 req/day).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { InsightResult } from './InsightGenerator';

const KEY_GEMINI_KEY    = 'soulsync.gemini.apiKey';
const KEY_LAST_INSIGHT  = 'soulsync.gemini.lastInsight';
const TTL_MS = 12 * 60 * 60 * 1000;

export const insightStorage = {
  async getApiKey(): Promise<string | null> {
    return AsyncStorage.getItem(KEY_GEMINI_KEY);
  },

  async setApiKey(key: string): Promise<void> {
    if (!key.trim()) return AsyncStorage.removeItem(KEY_GEMINI_KEY);
    return AsyncStorage.setItem(KEY_GEMINI_KEY, key.trim());
  },

  async clearApiKey(): Promise<void> {
    return AsyncStorage.removeItem(KEY_GEMINI_KEY);
  },

  /** Returns cached result if fresh (<12 h). */
  async getCached(): Promise<InsightResult | null> {
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
