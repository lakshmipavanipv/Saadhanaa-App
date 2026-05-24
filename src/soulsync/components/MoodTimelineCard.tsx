import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../theme';
import {
  buildMoodTimeline, colorForMood,
  MoodTimelineSnapshot,
} from '../analytics/MoodTimeline';

interface Props {
  /** YYYY-MM-DD — defaults to today. */
  date?: string;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const MoodTimelineCard: React.FC<Props> = ({ date }) => {
  const [snap, setSnap] = useState<MoodTimelineSnapshot | null>(null);
  const targetDate = date ?? todayStr();

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const s = await buildMoodTimeline(targetDate);
      if (!cancelled) setSnap(s);
    };
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [targetDate]);

  if (!snap) return null;

  const hasData = snap.hours.some(h => h.score != null);

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Mood Timeline</Text>
        <Text style={styles.dateChip}>{prettyDate(targetDate)}</Text>
      </View>
      <Text style={styles.subtitle}>
        How calm vs anxious your nervous system was, hour by hour
      </Text>

      {!hasData ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No ambient data for this day yet — the timeline fills in as the ring keeps streaming.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.ribbon}>
            {snap.hours.map(h => (
              <View
                key={h.hour}
                style={[
                  styles.cell,
                  { backgroundColor: colorForMood(h.category) },
                  h.events > 0 && styles.cellMarked,
                ]}
              />
            ))}
          </View>
          <View style={styles.scale}>
            <Text style={styles.scaleLabel}>0h</Text>
            <Text style={styles.scaleLabel}>6h</Text>
            <Text style={styles.scaleLabel}>12h</Text>
            <Text style={styles.scaleLabel}>18h</Text>
            <Text style={styles.scaleLabel}>23h</Text>
          </View>

          <View style={styles.legendRow}>
            <Legend color={colorForMood('calm')}    label="Calm" />
            <Legend color={colorForMood('neutral')} label="Neutral" />
            <Legend color={colorForMood('tense')}   label="Tense" />
            <Legend color={colorForMood('anxious')} label="Anxious" />
          </View>

          <View style={styles.statRow}>
            <Stat label="AVG SCORE"  value={snap.avgScore != null ? `${Math.round(snap.avgScore)}/100` : '—'} />
            <Stat label="DOMINANT"   value={cap(snap.dominantCategory)} valueColor={colorForMood(snap.dominantCategory)} />
            <Stat label="EVENTS"     value={String(snap.hours.reduce((a, b) => a + b.events, 0))} />
            <Stat label="SESSIONS"   value={String(snap.hours.reduce((a, b) => a + b.sessions, 0))} />
          </View>
        </>
      )}
    </View>
  );
};

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <View style={styles.legendItem}>
    <View style={[styles.legendDot, { backgroundColor: color }]} />
    <Text style={styles.legendText}>{label}</Text>
  </View>
);

const Stat: React.FC<{ label: string; value: string; valueColor?: string }> = ({ label, value, valueColor }) => (
  <View style={styles.statBox}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
  </View>
);

const prettyDate = (d: string): string => {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
const cap = (s: string): string => s ? s[0].toUpperCase() + s.slice(1) : s;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md, marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(214,224,64,0.12)',
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 15, color: '#d6e040', fontWeight: '700', letterSpacing: 0.5 },
  dateChip: { fontSize: 11, color: COLORS.muted },
  subtitle: { fontSize: 11, color: COLORS.muted, marginBottom: SPACING.sm },

  empty: { padding: SPACING.md, alignItems: 'center' },
  emptyText: { fontSize: 12, color: COLORS.muted, fontStyle: 'italic', textAlign: 'center' },

  ribbon: { flexDirection: 'row', gap: 2, marginTop: SPACING.sm, height: 26 },
  cell: { flex: 1, borderRadius: 3 },
  cellMarked: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
  scale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  scaleLabel: { fontSize: 9, color: COLORS.muted },

  legendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: COLORS.muted },

  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.md, gap: 6 },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 6,
             backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8 },
  statLabel: { fontSize: 9, color: COLORS.muted, fontWeight: '700', letterSpacing: 1 },
  statValue: { fontSize: 13, color: COLORS.cream, fontWeight: '700', marginTop: 2 },
});
