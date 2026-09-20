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
import type { SessionKind, SessionDepth } from '../analytics/SadhanaDepth';

interface Props {
  /**
   * What kind of practice this is.
   *
   * No longer label-only: it is stamped onto the session row so the sitting
   * can be found again by practice — which is what makes a per-practice depth
   * report and a deity breakdown possible at all.
   */
  practice?: SessionKind;
  /** Navigation ref so the popup can deep-link to Insights. */
  onViewInsights?: () => void;
  /** Deity this sitting is for, when the practice has one (japa). */
  deityId?: string | null;
  deityName?: string | null;
  /** Called when a sitting ends, with its scored report. */
  onSessionEnd?: (depth: SessionDepth | null) => void;
  /**
   * True when the screen's own ScrollView already pads horizontally.
   *
   * Exercise, Yoga and Meditation do not pad, so the bar carries its own 16.
   * Japa does, and without this the two stacked — the bar came out 32 from the
   * edge and visibly narrower than the same control on the Exercise tab.
   */
  flush?: boolean;
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
  practice = 'meditation',
  deityId,
  deityName,
  flush,
  onViewInsights,
  onSessionEnd,
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
  const [sessionDepth, setSessionDepth] = useState<SessionDepth | null>(null);

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
      // `stop()` finalises the row and scores the sitting in one step, and
      // hands back the report. The old path slept 600 ms hoping the write had
      // landed, then recomputed the whole DAY — so the popup after a second
      // sitting was partly made of the first one.
      const depth = await soulsync.stop();
      setSessionDepth(depth);
      setShowScoreModal(depth != null);
      onSessionEnd?.(depth);
    } else {
      // start() now rethrows when the ring can't be reached, so it can unwind
      // cleanly instead of leaving a half-open session behind. Swallow it here
      // — the bar simply stays off, which is what the user sees anyway.
      try {
        await soulsync.start({ practice, deityId, deityName });
      } catch (e) {
        console.warn('[Soulsync] session start failed:', (e as Error).message);
      }
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.bar, flush && styles.barFlush, soulsync.state.active && styles.barActive]}
        onPress={handleToggle}
        activeOpacity={0.85}
      >
        <View style={[styles.dot, soulsync.state.active && styles.dotActive]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, soulsync.state.active && styles.labelActive]}>
            {soulsync.state.active
              ? `◉ Recording your body · ${fmtElapsed(elapsed)}`
              : `Start Soulsync · score this ${practice} against your baseline`}
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

      {/* Live vitals while a session is recording.
          The bar itself only had room for a single cramped line, and it
          vanished entirely whenever liveBpm was null — so a session that was
          recording but not yet receiving heart rate looked broken. This panel
          always shows every channel, with an em dash for anything the ring is
          not currently streaming, so "connected but no reading yet" is
          distinguishable from "not working". */}
      {soulsync.state.active && (
        <View style={[styles.livePanel, flush && styles.barFlush]}>
          <Text style={styles.livePanelHead}>Live from your ring</Text>
          <View style={styles.liveRow}>
            <LiveStat label="Heart" value={soulsync.state.liveBpm} unit="bpm" color="#FF6B8A" />
            <LiveStat
              label="HRV"
              value={soulsync.state.rmssd != null ? Math.round(soulsync.state.rmssd) : null}
              unit="ms"
              color="#B39BFF"
            />
            <LiveStat label="SpO₂" value={soulsync.state.liveSpo2} unit="%" color="#7CB1FF" />
            {/* Derived from R-R intervals, so it stays blank on rings that
                report averaged heart rate only. See analytics/Respiration.ts. */}
            <LiveStat label="Breaths" value={soulsync.state.liveRespirationBpm} unit="/min" color="#8BD3C7" />
          </View>
          <Text style={styles.liveFoot}>
            {soulsync.state.liveBpm == null
              ? 'Waiting for the ring to report — keep it on your finger.'
              : `${soulsync.state.peaksRegistered} peak${soulsync.state.peaksRegistered === 1 ? '' : 's'} registered this session`}
          </Text>
        </View>
      )}

      <SessionScorePopup
        visible={showScoreModal}
        depth={sessionDepth}
        onClose={() => setShowScoreModal(false)}
        onViewInsights={onViewInsights ? () => {
          setShowScoreModal(false);
          onViewInsights();
        } : undefined}
      />
    </>
  );
};

/** One live reading. Renders an em dash rather than hiding when absent. */
const LiveStat: React.FC<{ label: string; value: number | null; unit: string; color: string }> = ({
  label, value, unit, color,
}) => (
  <View style={styles.liveStat}>
    <Text style={styles.liveStatLabel}>{label}</Text>
    <Text style={[styles.liveStatValue, { color: value == null ? COLORS.muted : color }]}>
      {value == null ? '—' : value}
      <Text style={styles.liveStatUnit}> {unit}</Text>
    </Text>
  </View>
);

const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  barFlush: { marginHorizontal: 0 },
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
  livePanel: {
    backgroundColor: C.cardBg, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    padding: SPACING.md, marginTop: SPACING.sm,
    // Lines up with the bar above it rather than running full-bleed.
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
  },
  livePanelHead: {
    fontSize: 10, fontWeight: '700', color: C.muted,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10,
  },
  liveRow: { flexDirection: 'row', justifyContent: 'space-between' },
  liveStat: { flex: 1, alignItems: 'center' },
  liveStatLabel: { fontSize: 10, color: C.muted, marginBottom: 4 },
  liveStatValue: { fontSize: 20, fontWeight: '800' },
  liveStatUnit: { fontSize: 10, fontWeight: '400', color: C.muted },
  liveFoot: { fontSize: 11, color: C.muted, marginTop: 10, textAlign: 'center' },
  action: {
    fontSize: 12, color: C.gold, fontWeight: '700',
    marginLeft: SPACING.sm,
  },
  actionActive: { color: C.error },
});

const styles = makeStyles(COLORS);
