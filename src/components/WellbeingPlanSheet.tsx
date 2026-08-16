/**
 * WellbeingPlanSheet — bottom sheet listing the 6 body activities we plan
 * for. Each tile shows the activity, its current daily goal, and a Set /
 * Change button. Persists to workoutGoalsRepo (already used by ExerciseScreen).
 */

import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Alert,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../theme';
import { workoutGoalsRepo, GOAL_UNIT_META, type GoalUnit, type WorkoutGoals } from '../services/workoutGoalsRepo';
import type { BodyActivity } from '../types';
import { EXERCISE_CATALOG, type WorkoutItem } from '../data/exerciseCatalog';

/**
 * Which activities appear in the Plan sheet + their per-activity default goal.
 * The step-by-step content, benefit blurb and contraindications come from
 * EXERCISE_CATALOG — the single source of truth kept up-to-date over time.
 */
const PLAN_ACTIVITIES: Array<{
  id: BodyActivity;
  color: string;
  defaultGoal: number;
  defaultUnit: GoalUnit;
}> = [
  { id: 'walk',  color: '#5dafff', defaultGoal: 8000, defaultUnit: 'steps' },
  { id: 'jog',   color: '#4ade80', defaultGoal: 20,   defaultUnit: 'min'   },
  { id: 'run',   color: '#ef4444', defaultGoal: 20,   defaultUnit: 'min'   },
  { id: 'cycle', color: '#a855f7', defaultGoal: 30,   defaultUnit: 'min'   },
  { id: 'swim',  color: '#06b6d4', defaultGoal: 30,   defaultUnit: 'min'   },
  { id: 'hiit',  color: '#f59e0b', defaultGoal: 15,   defaultUnit: 'min'   },
];

/** Enrich each plan entry with the catalog's canonical instructions. */
interface ActivityDef {
  id: BodyActivity;
  color: string;
  defaultGoal: number;
  defaultUnit: GoalUnit;
  catalog: WorkoutItem;
}

const ACTIVITIES: ActivityDef[] = PLAN_ACTIVITIES
  .map((a) => {
    const catalog = EXERCISE_CATALOG.find((c) => c.id === a.id);
    return catalog ? { ...a, catalog } : null;
  })
  .filter((x): x is ActivityDef => x !== null);

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const WellbeingPlanSheet: React.FC<Props> = ({ visible, onClose }) => {
  const [goals, setGoals] = useState<WorkoutGoals>({});
  const [expanded, setExpanded] = useState<BodyActivity | null>(null);
  const [editing, setEditing] = useState<BodyActivity | null>(null);
  const [editVal, setEditVal] = useState('');

  useEffect(() => {
    if (visible) workoutGoalsRepo.get().then(setGoals).catch(() => {});
  }, [visible]);

  const getGoal = (a: ActivityDef): { value: number; unit: GoalUnit } => {
    const value = goals.goalValue?.[a.id] ?? a.defaultGoal;
    const unit = goals.goalUnit?.[a.id] ?? a.defaultUnit;
    return { value, unit };
  };

  const startEdit = (a: ActivityDef) => {
    const g = getGoal(a);
    setEditing(a.id);
    setEditVal(String(g.value));
  };

  const saveEdit = async (a: ActivityDef) => {
    const parsed = parseInt(editVal, 10);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid', 'Enter a positive number.');
      return;
    }
    const updated: WorkoutGoals = {
      ...goals,
      goalValue: { ...(goals.goalValue ?? {}), [a.id]: parsed },
      goalUnit:  { ...(goals.goalUnit  ?? {}), [a.id]: a.defaultUnit },
    };
    await workoutGoalsRepo.set(updated);
    setGoals(updated);
    setEditing(null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>🎯 Plan Your Wellbeing</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>Pick an activity, set a daily goal, tap the tile for the how-to.</Text>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
            {ACTIVITIES.map((a) => {
              const g = getGoal(a);
              const isExpanded = expanded === a.id;
              const isEditing = editing === a.id;
              return (
                <View key={a.id} style={styles.card}>
                  <TouchableOpacity
                    style={styles.cardHeader}
                    onPress={() => setExpanded(isExpanded ? null : a.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.iconBox, { backgroundColor: a.color }]}>
                      <Text style={styles.iconTxt}>{a.catalog.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{a.catalog.name}</Text>
                      <Text style={styles.cardSubtitle}>{a.catalog.subtitle}</Text>
                      <Text style={styles.cardHint}>
                        Goal: {g.value} {GOAL_UNIT_META[g.unit].short} · tap to {isExpanded ? 'collapse' : 'view steps'}
                      </Text>
                    </View>
                    <Text style={styles.chev}>{isExpanded ? '▾' : '▸'}</Text>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.expandBody}>
                      {/* Benefit — WHY */}
                      <Text style={styles.benefit}>{a.catalog.benefit}</Text>

                      {/* Numbered steps 1, 2, 3, 4… — WHAT */}
                      <Text style={styles.stepsHeader}>How to do it</Text>
                      {a.catalog.steps.map((s, i) => (
                        <View key={i} style={styles.stepRow}>
                          <View style={[styles.stepNum, { backgroundColor: a.color }]}>
                            <Text style={styles.stepNumTxt}>{i + 1}</Text>
                          </View>
                          <Text style={styles.step}>{s}</Text>
                        </View>
                      ))}

                      {/* Contraindications — CAUTION */}
                      {a.catalog.contraindications && (
                        <View style={styles.contraCard}>
                          <Text style={styles.contraHead}>⚠ Contraindications</Text>
                          <Text style={styles.contraBody}>{a.catalog.contraindications}</Text>
                        </View>
                      )}

                      {/* Ring auto-detect indicator */}
                      {a.catalog.ringAutoDetect && (
                        <Text style={styles.autoNote}>💍 Ring auto-detects this activity — starts logging when you move</Text>
                      )}

                      {isEditing ? (
                        <View style={styles.editRow}>
                          <TextInput
                            style={styles.input}
                            value={editVal}
                            onChangeText={setEditVal}
                            keyboardType="numeric"
                            autoFocus
                            placeholder={`Goal ${GOAL_UNIT_META[a.defaultUnit].short}`}
                            placeholderTextColor={COLORS.muted}
                          />
                          <Text style={styles.inputUnit}>{GOAL_UNIT_META[a.defaultUnit].short}</Text>
                          <TouchableOpacity style={styles.saveBtn} onPress={() => saveEdit(a)}>
                            <Text style={styles.saveTxt}>Save</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(null)}>
                            <Text style={styles.cancelTxt}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity style={styles.setBtn} onPress={() => startEdit(a)}>
                          <Text style={styles.setBtnTxt}>Set / Change Goal</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.deep,
    borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl,
    height: '88%',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm,
  },
  handle: { width: 40, height: 4, backgroundColor: COLORS.muted, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: COLORS.cream, fontSize: FONT_SIZES['2xl'], fontWeight: '700' },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: COLORS.cardBg },
  closeTxt: { color: COLORS.cream, fontSize: FONT_SIZES.lg },
  subtitle: { color: COLORS.muted, fontSize: FONT_SIZES.sm, marginBottom: SPACING.md, marginTop: 2 },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md },
  iconBox: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  iconTxt: { fontSize: 22 },
  cardTitle: { color: COLORS.cream, fontSize: FONT_SIZES.lg, fontWeight: '600' },
  cardSubtitle: { color: COLORS.muted, fontSize: FONT_SIZES.xs, marginTop: 1 },
  cardHint: { color: COLORS.gold, fontSize: FONT_SIZES.xs, marginTop: 4 },
  chev: { color: COLORS.muted, fontSize: FONT_SIZES.lg },

  expandBody: {
    padding: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
  },
  benefit: {
    color: COLORS.cream, fontSize: FONT_SIZES.sm, lineHeight: 20,
    fontStyle: 'italic', marginBottom: SPACING.md,
    backgroundColor: 'rgba(212, 160, 23, 0.06)',
    padding: SPACING.sm, borderRadius: BORDER_RADIUS.sm,
    borderLeftWidth: 3, borderLeftColor: COLORS.gold,
  },
  stepsHeader: {
    color: COLORS.gold, fontSize: FONT_SIZES.xs, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.xs,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: SPACING.sm },
  stepNum: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.sm, marginTop: 1,
  },
  stepNumTxt: { color: '#000', fontSize: 11, fontWeight: '700' },
  step: { color: COLORS.cream, fontSize: FONT_SIZES.sm, flex: 1, lineHeight: 20 },
  contraCard: {
    marginTop: SPACING.md,
    padding: SPACING.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: BORDER_RADIUS.sm,
    borderLeftWidth: 3, borderLeftColor: COLORS.error,
  },
  contraHead: { color: COLORS.error, fontSize: FONT_SIZES.xs, fontWeight: '700', marginBottom: 2 },
  contraBody: { color: COLORS.cream, fontSize: FONT_SIZES.sm, lineHeight: 18 },
  autoNote: {
    color: COLORS.leaf, fontSize: FONT_SIZES.xs,
    marginTop: SPACING.sm, fontStyle: 'italic',
  },
  setBtn: {
    marginTop: SPACING.md,
    padding: SPACING.sm,
    backgroundColor: COLORS.gold,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  setBtnTxt: { color: '#000', fontSize: FONT_SIZES.sm, fontWeight: '700' },

  editRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.md, gap: SPACING.xs },
  input: {
    flex: 1, backgroundColor: COLORS.deep,
    borderRadius: BORDER_RADIUS.sm,
    color: COLORS.cream, paddingHorizontal: SPACING.sm, paddingVertical: 8,
    fontSize: FONT_SIZES.base,
  },
  inputUnit: { color: COLORS.muted, fontSize: FONT_SIZES.sm, marginRight: SPACING.xs },
  saveBtn: { backgroundColor: COLORS.gold, paddingHorizontal: SPACING.sm, paddingVertical: 8, borderRadius: BORDER_RADIUS.sm },
  saveTxt: { color: '#000', fontSize: FONT_SIZES.sm, fontWeight: '700' },
  cancelBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 8 },
  cancelTxt: { color: COLORS.muted, fontSize: FONT_SIZES.sm },
});
