/**
 * EmotionEventBus — in-memory pub/sub for emotional events.
 *
 * Detectors emit on this bus AFTER persisting the event to SQLite.
 * The UI (Dashboard + AppContent) subscribes and routes to the
 * correct overlay (Grounding / Micro-Sādhanā / Cooling).
 */

import { EmotionalEvent } from './types';

type Listener = (e: EmotionalEvent) => void;

class Bus {
  private listeners = new Set<Listener>();
  private lastEvent: EmotionalEvent | null = null;

  emit(e: EmotionalEvent): void {
    this.lastEvent = e;
    this.listeners.forEach(l => {
      try { l(e); } catch (err) { console.warn('[EmotionBus] listener error', err); }
    });
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }

  /** Useful for late subscribers — get the most recent event. */
  getLast(): EmotionalEvent | null { return this.lastEvent; }

  clear(): void { this.lastEvent = null; }
}

export const emotionEventBus = new Bus();
