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
import { useSoulsyncSession, type SoulsyncSessionState } from '../hooks/useSoulsyncSession';
import { useSoulsync } from '../SoulsyncContext';
import { autoSession } from '../services/autoSession';
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

/**
 * The HRV to show, in ms — whichever of the two the hardware actually produced.
 *
 * `rmssd` is the good number: computed here from real R-R intervals. No ring
 * the app supports streams them, so it is null in practice. `liveHrv` is what
 * the ring's firmware measured on its own. Prefer the former, fall back to the
 * latter, show an em dash only when neither exists.
 */
const hrvMs = (s: SoulsyncSessionState): number | null => {
  const v = s.rmssd ?? s.liveHrv;
  return v != null ? Math.round(v) : null;
};

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
  // The app's shared sitting, unless the screen handed one down. `useSoulsync`
  // reads the provider above the navigator, so the fallback is no longer a
  // private state machine nobody else can see — which is what left the
  // Exercise tab unable to observe the session its own bar had started.
  const ownSession = useSoulsync();
  const soulsync = session ?? ownSession;

  /**
   * A sitting is running, but it is not this practice's.
   *
   * Possible now that one session is shared app-wide: yoga is recording and
   * the user is looking at meditation's card, or japa auto-started from the
   * ring while the Exercise tab is open. Tapping Stop here would end that
   * sitting and file it under whatever it was started as — so the bar says
   * what is actually recording instead of offering a button that lies.
   */
  const otherPractice =
    soulsync.state.active && soulsync.state.practice != null &&
    soulsync.state.practice !== practice
      ? soulsync.state.practice
      : null;
  const [elapsed, setElapsed] = useState(0);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [sessionDepth, setSessionDepth] = useState<SessionDepth | null>(null);

  /*
   * Elapsed time, measured from when the sitting actually began.
   *
   * This used to count up from 0 whenever `active` flipped, which was right
   * while a bar only ever saw the session it had started itself. It is wrong
   * now: a sitting can start from the ring with the phone in a pocket, and the
   * bar that mounts twenty minutes later would have read "0:01". Deriving it
   * from `startedAt` also survives the tab being left and returned to.
   */
  const startedAt = soulsync.state.startedAt;
  useEffect(() => {
    if (!soulsync.state.active || startedAt == null) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [soulsync.state.active, startedAt]);

  const handleToggle = async () => {
    // Someone else's sitting. Say so; do not end it from here.
    if (otherPractice) return;
    if (soulsync.state.active) {
      // Whatever ends a sitting, the auto-starter has to hear about it —
      // otherwise it goes on believing it still owns a session that no longer
      // exists, and the next bead is read as "still going" rather than as the
      // start of something new.
      autoSession.noteSessionEnded();
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
            {otherPractice
              ? `◉ Recording your ${otherPractice} · ${fmtElapsed(elapsed)}`
              : soulsync.state.active
                ? `◉ Recording your body · ${fmtElapsed(elapsed)}`
                : `Start Soulsync · score this ${practice} against your baseline`}
          </Text>
          {soulsync.state.active && soulsync.state.liveBpm != null && (
            <Text style={styles.liveStats}>
              ❤️ {soulsync.state.liveBpm} bpm
              {hrvMs(soulsync.state) != null && `   〰️ ${hrvMs(soulsync.state)} ms HRV`}
              {soulsync.state.peaksRegistered > 0 && `   ✨ ${soulsync.state.peaksRegistered} peaks`}
            </Text>
          )}
        </View>
        <Text style={[styles.action, soulsync.state.active && styles.actionActive]}>
          {otherPractice ? '' : soulsync.state.active ? 'Stop' : 'Start'}
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
            {/* `rmssd` is computed here from R-R intervals, which the SR16
                never streams — so it is structurally null on this hardware and
                this tile read an em dash for every session ever recorded.
                `liveHrv` is the HRV the ring's own firmware measured, which is
                the only HRV that exists. LiveVitalsTrends already uses it. */}
            <LiveStat
              label="HRV"
              value={hrvMs(soulsync.state)}
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
