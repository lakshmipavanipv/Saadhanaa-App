/**
 * SoulsyncSessionBar — reusable "Start/Stop Soulsync session" pill.
 *
 * Used on Yoga + Meditation screens (and anywhere else that benefits
 * from biometric capture during a practice). Mirrors the toggle on
 * the Japa screen but without the peak counter / mala recording.
 *
 * Behaviour:
 *   • Tap when OFF → starts ring telemetry recording
 *   • Tap when ON  → stops recording AND shows the Saadhana Score popup
 *   • Live time elapsed shown while recording
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { useTheme } from '../../ThemeContext';
import { useSoulsyncSession } from '../hooks/useSoulsyncSession';
import { SessionScorePopup } from './SessionScorePopup';
import { computeJapaEffect, JapaEffectSnapshot } from '../analytics/JapaEffect';

interface Props {
  /** What kind of practice (used in label only). */
  practice?: string;        // e.g. "yoga", "meditation"
  /** Navigation ref so the popup can deep-link to Insights. */
  onViewInsights?: () => void;
  /** Optional EXTERNAL soulsync session.  If the parent screen already
   *  holds a `useSoulsyncSession()` instance — because it also renders
   *  LiveVitalsTrends / BeforeAfterVitals that read from the same hook
   *  state — pass it in here so we mutate the SAME state instead of
   *  forking a second, isolated instance.  Without this, the bar would
   *  start a session on its own private hook and the parent's
   *  LiveVitalsTrends would stay empty. */
  session?: ReturnType<typeof useSoulsyncSession>;
}

const fmtElapsed = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const SoulsyncSessionBar: React.FC<Props> = ({
  practice = 'practice',
  onViewInsights,
  session,
}) => {
  const { palette } = useTheme();
  const styles = React.useMemo(() => makeStyles(palette), [palette]);
  // Use the parent-supplied session if it exists; otherwise spin up our
  // own (so the bar still works standalone in screens that don't render
  // LiveVitalsTrends).  Note: a hook is called unconditionally to keep
  // React's rules-of-hooks happy — if `session` is passed in, the
  // internal hook still mounts but we just ignore its return value.
  const ownSession = useSoulsyncSession();
  const soulsync = session ?? ownSession;
  const [elapsed, setElapsed] = useState(0);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [scoreSnap, setScoreSnap] = useState<JapaEffectSnapshot | null>(null);

  // Tick elapsed time while session is active
  useEffect(() => {
    if (!soulsync.state.active) {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [soulsync.state.active]);

  const handleToggle = async () => {
    if (soulsync.state.active) {
      await soulsync.stop();
      // Brief delay so DB finalisation lands, then compute + show score
      await new Promise(r => setTimeout(r, 600));
      try {
        const snap = await computeJapaEffect();
        setScoreSnap(snap);
        setShowScoreModal(true);
      } catch { /* soft fail */ }
    } else {
      await soulsync.start();
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.bar, soulsync.state.active && styles.barActive]}
        onPress={handleToggle}
        activeOpacity={0.85}
      >
        <View style={[styles.dot, soulsync.state.active && styles.dotActive]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, soulsync.state.active && styles.labelActive]}>
            {soulsync.state.active
              ? `◉ Recording your body · ${fmtElapsed(elapsed)}`
              : `Start Soulsync · track this ${practice} on your body`}
          </Text>
          {soulsync.state.active && soulsync.state.liveBpm != null && (
            <Text style={styles.liveStats}>
              ❤️ {soulsync.state.liveBpm} bpm
              {soulsync.state.rmssd != null && `   〰️ ${Math.round(soulsync.state.rmssd)} ms HRV`}
              {soulsync.state.peaksRegistered > 0 && `   ✨ ${soulsync.state.peaksRegistered} peaks`}
            </Text>
          )}
        </View>
        <Text style={[styles.action, soulsync.state.active && styles.actionActive]}>
          {soulsync.state.active ? 'Stop' : 'Start'}
        </Text>
      </TouchableOpacity>

      <SessionScorePopup
        visible={showScoreModal}
        snapshot={scoreSnap}
        onClose={() => setShowScoreModal(false)}
        onViewInsights={onViewInsights ? () => {
          setShowScoreModal(false);
          onViewInsights();
        } : undefined}
      />
    </>
  );
};

const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    backgroundColor: C.cardBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  barActive: {
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    borderColor: C.gold,
  },
  dot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: C.muted,
    marginRight: SPACING.sm,
  },
  dotActive: {
    backgroundColor: '#3ddc84',
    shadowColor: '#3ddc84', shadowOpacity: 1, shadowRadius: 6,
  },
  label: { fontSize: 12, color: C.cream, fontWeight: '500' },
  labelActive: { color: C.gold, fontWeight: '700' },
  liveStats: { fontSize: 11, color: C.cream, marginTop: 2 },
  action: {
    fontSize: 12, color: C.gold, fontWeight: '700',
    marginLeft: SPACING.sm,
  },
  actionActive: { color: C.error },
});

const styles = makeStyles(COLORS);
