/**
 * ExerciseScreen — body-activity hub.
 *
 *   • Top KPI strip: today's body minutes / daily goal
 *   • Activity breakdown card: minutes per activity over 7 days
 *   • SoulsyncSessionBar — start recording before any workout
 *   • Quick-log buttons for each activity (Swim, Walk, Run, Jog, Cycle, Gym)
 *   • Tap → modal to log duration / distance / notes
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity, Modal, TextInput,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { SoulsyncSessionBar } from '../soulsync/components/SoulsyncSessionBar';
import { useSadhana } from '../context';
import { exerciseRepo } from '../services/exerciseRepo';
import { BodyActivity, ExerciseEntry } from '../types';
import { todayStr } from '../utils';

const ACTIVITIES: { id: BodyActivity; label: string; icon: string }[] = [
  { id: 'walk',  label: 'Walk',   icon: '🚶' },
  { id: 'run',   label: 'Run',    icon: '🏃' },
  { id: 'jog',   label: 'Jog',    icon: '🏃‍♀️' },
  { id: 'cycle', label: 'Cycle',  icon: '🚴' },
  { id: 'swim',  label: 'Swim',   icon: '🏊' },
  { id: 'gym',   label: 'Gym',    icon: '🏋️' },
  { id: 'yoga',  label: 'Yoga',   icon: '🧘‍♀️' },
];

export const ExerciseScreen = ({ navigation }: any) => {
  const { userProfile } = useSadhana();
  const goalMin = userProfile?.goals?.bodyMinutesPerDay ?? 30;

  const [todayMin, setTodayMin] = useState(0);
  const [breakdown, setBreakdown] = useState<Awaited<ReturnType<typeof exerciseRepo.breakdown>>>([]);
  const [history, setHistory] = useState<ExerciseEntry[]>([]);
  const [logFor, setLogFor] = useState<BodyActivity | null>(null);
  const [logMin, setLogMin] = useState('30');
  const [logDistance, setLogDistance] = useState('');
  const [logNotes, setLogNotes] = useState('');

  const refresh = async () => {
    setTodayMin(await exerciseRepo.todayMinutes());
    setBreakdown(await exerciseRepo.breakdown(7));
    setHistory((await exerciseRepo.list()).reverse().slice(0, 10));
  };
  useEffect(() => { refresh(); }, []);

  const handleSaveLog = async () => {
    if (!logFor) return;
    const m = parseInt(logMin, 10) || 0;
    if (m <= 0) return;
    await exerciseRepo.add({
      date: todayStr(),
      activity: logFor,
      durationMin: m,
      ...(logDistance && { distanceKm: parseFloat(logDistance) }),
      ...(logNotes && { notes: logNotes }),
    });
    setLogFor(null);
    setLogMin('30'); setLogDistance(''); setLogNotes('');
    refresh();
  };

  const goalPct = Math.min(100, Math.round((todayMin / goalMin) * 100));

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Exercise</Text>
          <Text style={styles.subtitle}>Body movement · strength · cardio</Text>
        </View>

        {/* KPI hero */}
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>BODY MINUTES TODAY</Text>
          <Text style={styles.kpiBig}>
            {todayMin} <Text style={styles.kpiSmall}>/ {goalMin} min</Text>
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${goalPct}%` }]} />
          </View>
          <Text style={styles.kpiHint}>
            {goalPct >= 100
              ? '🎉 Goal complete — beautiful work for your body'
              : todayMin === 0
                ? 'Tap any activity below to log a quick session'
                : `${goalMin - todayMin} more min to reach today's goal`}
          </Text>
        </View>

        {/* Soulsync recording bar */}
        <SoulsyncSessionBar
          practice="exercise"
          onViewInsights={() => navigation?.navigate?.('History')}
        />

        {/* Quick-log grid */}
        <Text style={styles.sectionLabel}>QUICK LOG</Text>
        <View style={styles.grid}>
          {ACTIVITIES.map(a => (
            <TouchableOpacity
              key={a.id}
              style={styles.activityCard}
              onPress={() => setLogFor(a.id)}
            >
              <Text style={styles.activityIcon}>{a.icon}</Text>
              <Text style={styles.activityLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 7-day breakdown */}
        {breakdown.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>7-DAY BREAKDOWN</Text>
            <View style={styles.breakdownCard}>
              {breakdown.map(b => (
                <View key={b.activity} style={styles.breakdownRow}>
                  <Text style={styles.breakdownIcon}>
                    {ACTIVITIES.find(a => a.id === b.activity)?.icon}
                  </Text>
                  <Text style={styles.breakdownLabel}>
                    {ACTIVITIES.find(a => a.id === b.activity)?.label}
                  </Text>
                  <Text style={styles.breakdownCount}>{b.count} session{b.count !== 1 ? 's' : ''}</Text>
                  <Text style={styles.breakdownMin}>{b.minutes} min</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Recent log */}
        {history.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>RECENT SESSIONS</Text>
            <View style={styles.breakdownCard}>
              {history.map(h => (
                <View key={h.id} style={styles.historyRow}>
                  <Text style={styles.breakdownIcon}>
                    {ACTIVITIES.find(a => a.id === h.activity)?.icon}
                  </Text>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.historyLabel}>
                      {ACTIVITIES.find(a => a.id === h.activity)?.label} · {h.durationMin} min
                    </Text>
                    <Text style={styles.historyDate}>
                      {h.date}{h.distanceKm ? ` · ${h.distanceKm} km` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={async () => { await exerciseRepo.remove(h.id); refresh(); }}>
                    <Text style={styles.deleteX}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Log modal */}
      <Modal visible={!!logFor} transparent animationType="slide" onRequestClose={() => setLogFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              Log {logFor && ACTIVITIES.find(a => a.id === logFor)?.label}
            </Text>
            <Text style={styles.modalSub}>How long was your session?</Text>

            <Text style={styles.fieldLabel}>Minutes</Text>
            <TextInput
              style={styles.input}
              value={logMin}
              onChangeText={setLogMin}
              keyboardType="numeric"
              placeholder="30"
              placeholderTextColor={COLORS.muted}
            />

            <Text style={styles.fieldLabel}>Distance (km) — optional</Text>
            <TextInput
              style={styles.input}
              value={logDistance}
              onChangeText={setLogDistance}
              keyboardType="numeric"
              placeholder="5"
              placeholderTextColor={COLORS.muted}
            />

            <Text style={styles.fieldLabel}>Notes — optional</Text>
            <TextInput
              style={styles.input}
              value={logNotes}
              onChangeText={setLogNotes}
              placeholder="How did you feel?"
              placeholderTextColor={COLORS.muted}
            />

            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setLogFor(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveLog}>
                <Text style={styles.saveText}>Save session</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  content: { paddingBottom: 80, paddingTop: SPACING.lg },
  header: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  title: { fontSize: 24, color: COLORS.cream, fontWeight: '600' },
  subtitle: { fontSize: 12, color: COLORS.muted, marginTop: 4 },

  kpiCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.lg, backgroundColor: COLORS.cardBg,
    borderRadius: 16, borderWidth: 2, borderColor: COLORS.gold,
    alignItems: 'center',
  },
  kpiLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  kpiBig: { fontSize: 38, color: COLORS.gold, fontWeight: '700' },
  kpiSmall: { fontSize: 14, color: COLORS.muted, fontWeight: '500' },
  progressTrack: {
    width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4, marginVertical: SPACING.sm, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.gold },
  kpiHint: { fontSize: 12, color: COLORS.cream, fontStyle: 'italic', textAlign: 'center', marginTop: 4 },

  sectionLabel: {
    fontSize: 11, color: COLORS.muted, fontWeight: '700', letterSpacing: 1.5,
    marginHorizontal: SPACING.md, marginTop: SPACING.lg, marginBottom: SPACING.sm,
  },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: SPACING.md, gap: SPACING.sm,
  },
  activityCard: {
    width: '30%', aspectRatio: 1,
    backgroundColor: COLORS.cardBg, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  activityIcon: { fontSize: 32, marginBottom: 4 },
  activityLabel: { color: COLORS.cream, fontSize: 12, fontWeight: '600' },

  breakdownCard: {
    marginHorizontal: SPACING.md,
    padding: SPACING.md, backgroundColor: COLORS.cardBg,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  breakdownRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  breakdownIcon: { fontSize: 20, width: 28 },
  breakdownLabel: { flex: 1, color: COLORS.cream, fontSize: 13, fontWeight: '600', marginLeft: 4 },
  breakdownCount: { color: COLORS.muted, fontSize: 11, marginRight: SPACING.sm },
  breakdownMin: { color: COLORS.gold, fontSize: 13, fontWeight: '700' },
  historyRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  historyLabel: { color: COLORS.cream, fontSize: 13, fontWeight: '600' },
  historyDate: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  deleteX: { color: COLORS.error, fontSize: 16, padding: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.darkBg,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: SPACING.md, paddingBottom: SPACING.xl,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  modalTitle: { fontSize: 18, color: COLORS.cream, fontWeight: '600' },
  modalSub: { fontSize: 12, color: COLORS.muted, marginTop: 2, marginBottom: SPACING.md },
  fieldLabel: { fontSize: 12, color: COLORS.cream, fontWeight: '600', marginTop: SPACING.sm, marginBottom: 4 },
  input: {
    backgroundColor: COLORS.cardBg, borderRadius: 8,
    padding: SPACING.md, color: COLORS.cream, fontSize: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  cancelText: { color: COLORS.cream, fontSize: 14, fontWeight: '600' },
  saveBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 10,
    backgroundColor: COLORS.gold, alignItems: 'center',
  },
  saveText: { color: COLORS.deep, fontSize: 14, fontWeight: '700' },
});
