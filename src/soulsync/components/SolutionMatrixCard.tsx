/**
 * SolutionMatrixCard — Bio-Spiritual Solution Matrix.
 *
 * Section A — Imbalance Log: timeline of every flagged trigger today.
 * Section B — Remedy Correlation: each imbalance paired with the
 *             intervention that followed (and HRV improvement %).
 * Statistical Output — convergence rate over 7 / 30 / 90 day windows
 *             ("setting the body right" trend).
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { emotionalEventRepo } from '../db/emotionalEventRepo';
import { EmotionalEventRow, EmotionTrigger } from '../emotional/types';

interface Window {
  label: string;
  resolved: number;
  total: number;
  rate: number;
}

const triggerIcon = (t: EmotionTrigger): string => ({
  anxiety: '🌀', lethargy: '🌱', aggression: '⚡',
}[t] || '·');

const triggerColor = (t: EmotionTrigger): string => ({
  anxiety: '#7EA1D8', lethargy: '#4ade80', aggression: '#ff8c42',
}[t] || '#a0a0a0');

const interventionLabel = (id: string | null): string => {
  if (!id) return 'no intervention';
  return ({
    grounding_japa: 'Grounding Japa',
    micro_sadhana: 'Micro-Sādhanā',
    cooling_workspace: 'Cooling Workspace',
  } as any)[id] || id;
};

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatMinutesBetween = (a: string, b: string): string => {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'within 1 min';
  return `${min} min later`;
};

export const SolutionMatrixCard: React.FC = () => {
  const [todays, setTodays] = useState<EmotionalEventRow[]>([]);
  const [windows, setWindows] = useState<Window[]>([]);

  useEffect(() => {
    const refresh = async () => {
      try {
        const events = await emotionalEventRepo.todaysEvents();
        const w7  = await emotionalEventRepo.convergenceRate(7);
        const w30 = await emotionalEventRepo.convergenceRate(30);
        const w90 = await emotionalEventRepo.convergenceRate(90);
        setTodays(events);
        setWindows([
          { label: '7d',  ...w7  },
          { label: '30d', ...w30 },
          { label: '90d', ...w90 },
        ]);
      } catch { /* soft-fail */ }
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Bio-Spiritual Solution Matrix</Text>
        <Text style={styles.todayChip}>Today: {todays.length}</Text>
      </View>
      <Text style={styles.subtitle}>
        Every wave your body felt today — and how your sadhana responded
      </Text>

      {/* SECTION A — IMBALANCE LOG */}
      <Text style={styles.sectionLabel}>IMBALANCE LOG · TODAY</Text>
      {todays.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyText}>
            🪷 No imbalances flagged today — your nervous system is settled.
          </Text>
        </View>
      ) : (
        <View>
          {todays.map(ev => {
            const trigger = ev.trigger_type as EmotionTrigger;
            const color = triggerColor(trigger);
            return (
              <View key={ev.id} style={styles.eventBlock}>
                <View style={[styles.eventBar, { backgroundColor: color }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.eventHeaderRow}>
                    <Text style={[styles.eventIcon]}>{triggerIcon(trigger)}</Text>
                    <Text style={[styles.eventTitle, { color }]}>
                      {capitalise(trigger)} · {ev.severity}
                    </Text>
                    <Text style={styles.eventTime}>{formatTime(ev.detected_at)}</Text>
                  </View>

                  {/* SECTION B — REMEDY CORRELATION */}
                  {ev.intervention_started_at ? (
                    <Text style={styles.eventDetail}>
                      → <Text style={styles.eventBold}>{interventionLabel(ev.intervention_id)}</Text>{' '}
                      {ev.intervention_completed_at ? 'completed ' : 'started '}
                      {formatMinutesBetween(ev.detected_at, ev.intervention_started_at)}
                      {ev.hrv_improvement_pct != null && ev.hrv_improvement_pct > 0 && (
                        <Text style={styles.eventGood}>{' '}· HRV +{Math.round(ev.hrv_improvement_pct)}%</Text>
                      )}
                    </Text>
                  ) : (
                    <Text style={styles.eventDetailMuted}>
                      → no intervention yet
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* STATISTICAL OUTPUT — CONVERGENCE RATE */}
      <Text style={styles.sectionLabel}>BODY-SETTING CONVERGENCE</Text>
      <View style={styles.windowRow}>
        {windows.map(w => (
          <View key={w.label} style={styles.windowBox}>
            <Text style={styles.windowPct}>
              {w.total > 0 ? `${Math.round(w.rate * 100)}%` : '—'}
            </Text>
            <Text style={styles.windowLabel}>{w.label}</Text>
            <Text style={styles.windowFraction}>
              {w.total > 0 ? `${w.resolved}/${w.total}` : 'no data'}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.windowHint}>
        % of imbalance events you brought back into balance with sadhana
      </Text>
    </View>
  );
};

const capitalise = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md, marginVertical: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(214, 224, 64, 0.12)',
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 15, color: '#d6e040', fontWeight: '700', letterSpacing: 0.5 },
  todayChip: {
    backgroundColor: 'rgba(214, 224, 64, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    color: '#d6e040',
    fontSize: 11,
    fontWeight: '700',
  },
  subtitle: { fontSize: 11, color: COLORS.muted, marginBottom: SPACING.md },
  sectionLabel: {
    fontSize: 10, color: COLORS.muted, fontWeight: '700', letterSpacing: 1.2,
    marginTop: SPACING.md, marginBottom: SPACING.sm,
  },
  emptyBlock: {
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.md,
    backgroundColor: 'rgba(74, 222, 128, 0.08)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(74, 222, 128, 0.20)',
  },
  emptyText: { fontSize: 12, color: COLORS.cream, textAlign: 'center', fontStyle: 'italic' },
  eventBlock: {
    flexDirection: 'row', marginBottom: SPACING.sm, paddingVertical: 8,
  },
  eventBar: { width: 3, alignSelf: 'stretch', marginRight: 10, borderRadius: 2 },
  eventHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventIcon: { fontSize: 16 },
  eventTitle: { flex: 1, fontSize: 13, fontWeight: '700' },
  eventTime: { fontSize: 11, color: COLORS.muted },
  eventDetail: { fontSize: 12, color: COLORS.cream, marginTop: 4, lineHeight: 17 },
  eventDetailMuted: { fontSize: 11, color: COLORS.muted, marginTop: 4, fontStyle: 'italic' },
  eventBold: { fontWeight: '700', color: COLORS.gold },
  eventGood: { color: COLORS.leaf, fontWeight: '700' },
  windowRow: { flexDirection: 'row', gap: 8 },
  windowBox: {
    flex: 1, paddingVertical: SPACING.sm, alignItems: 'center',
    backgroundColor: 'rgba(214, 224, 64, 0.08)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(214, 224, 64, 0.18)',
  },
  windowPct: { fontSize: 20, color: '#d6e040', fontWeight: '700' },
  windowLabel: { fontSize: 10, color: COLORS.muted, letterSpacing: 1.2, marginTop: 2 },
  windowFraction: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
  windowHint: { fontSize: 10, color: COLORS.muted, fontStyle: 'italic', marginTop: 6, textAlign: 'center' },
});
