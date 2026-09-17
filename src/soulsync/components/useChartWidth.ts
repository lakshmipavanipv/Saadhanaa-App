/**
 * useChartWidth — size a chart to the box it is actually in.
 *
 * WHY
 *
 * Every chart card used to compute its own width by subtracting a guess from
 * the screen:
 *
 *     const CHART_W = Dimensions.get('window').width - 64;   // ScoreTrends
 *     const CHART_W = Dimensions.get('window').width - 32;   // BpmJourney
 *     const CHART_W = Dimensions.get('window').width - 56;   // others
 *
 * Three faults, and all three were visible as charts spilling past their card
 * borders on the reports screen:
 *
 *   1. The subtraction encodes one screen's padding. The same card rendered
 *      inside a screen with different padding overflows by exactly the
 *      difference, and nothing in the card can know that.
 *   2. `Dimensions.get()` at module scope runs once at import. Rotate the
 *      phone, split the screen, or unfold a foldable and every chart keeps
 *      the width it was born with.
 *   3. The constants disagree with each other — 32 here, 64 there — so two
 *      cards stacked in one column drew to different widths and looked
 *      misaligned even when neither overflowed.
 *
 * Measuring removes the guess: the chart is whatever its parent turned out to
 * be, on any screen, at any size, after any rotation.
 *
 * USAGE
 *
 *     const { width, onLayout } = useChartWidth();
 *     return (
 *       <View onLayout={onLayout}>
 *         {width > 0 && <Svg width={width} … />}
 *       </View>
 *     );
 *
 * Render the chart only once `width > 0`. The first pass has no measurement
 * yet, and drawing at the fallback then snapping to the real width is a
 * visible flicker on every mount.
 */

import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export interface ChartWidth {
  /** Measured inner width in px. 0 until the first layout pass. */
  width: number;
  onLayout: (e: LayoutChangeEvent) => void;
}

/**
 * @param inset Horizontal padding of the measured view, in px. The layout
 *   width includes the card's own padding, so a chart drawn at the raw
 *   measurement overflows by exactly that much. Pass `SPACING.md * 2` for a
 *   card padded on both sides, 0 for a container with none.
 */
export function useChartWidth(inset: number = 0): ChartWidth {
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.max(0, e.nativeEvent.layout.width - inset);
    // Ignore sub-pixel jitter. Without this, a layout that settles at
    // 341.3333 then 341.3334 re-renders the chart on every pass.
    setWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
  }, [inset]);

  return { width, onLayout };
}
