/**
 * stepTracker.web — web stub. expo-sensors' Pedometer isn't available (and
 * doesn't resolve) on web, so the web bundle uses these no-ops. Metro picks
 * this file over stepTracker.ts automatically for the web platform.
 */

export const stepsToKcal = (steps: number) => Math.round(steps * 0.04);
export const stepsToKm = (steps: number) => +(steps * 0.000762).toFixed(2);

export const getTodaySteps = async (): Promise<number> => 0;
export const addSteps = async (_delta: number): Promise<number> => 0;
export const startStepTracking = async (
  _onUpdate?: (todaySteps: number) => void
): Promise<() => void> => {
  return () => {};
};
