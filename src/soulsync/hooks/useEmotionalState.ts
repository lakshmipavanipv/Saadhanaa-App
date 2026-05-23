/**
 * useEmotionalState — subscribes to the EmotionEventBus and exposes the
 * currently active intervention event (if any) to the React tree.
 *
 * One global subscriber lives in AppContent and routes the event to the
 * correct overlay (Grounding / Micro-Sādhanā / Cooling). When the user
 * dismisses or completes, we call `clearActive()` to take it off-screen.
 */

import { useEffect, useState, useCallback } from 'react';
import { emotionEventBus } from '../emotional/EmotionEventBus';
import { EmotionalEvent } from '../emotional/types';
import { getEmotionalEngine } from '../emotional/EmotionalEngine';

export const useEmotionalState = () => {
  const [activeEvent, setActiveEvent] = useState<EmotionalEvent | null>(null);

  useEffect(() => {
    return emotionEventBus.subscribe(e => {
      setActiveEvent(e);
      // Pause detectors while user is in the overlay
      getEmotionalEngine()?.suppress();
    });
  }, []);

  const dismiss = useCallback(() => {
    setActiveEvent(null);
    getEmotionalEngine()?.resume();
  }, []);

  return { activeEvent, dismiss };
};
