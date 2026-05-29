/**
 * PracticeAssistant — single CTA button that, when tapped, opens a
 * full-screen modal listing every yoga (or meditation) practice the
 * user can do RIGHT NOW. Replaces the cluttered "recommended" card +
 * category filter + flat catalog list that lived on YogaScreen /
 * MeditationScreen before.
 *
 * The modal merges:
 *   1. User's own custom Sadhana Paths from routineRepo (saved in the
 *      Plan tab with `steps` defined) — shown FIRST since they're the
 *      most personal.
 *   2. The full built-in catalog (YOGA_CATALOG / MEDITATION_CATALOG).
 *
 * Tapping any item invokes the parent-provided `onSelect` callback so
 * the existing detail-modal flow keeps working unchanged.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { routineRepo, RoutineItem, RoutineCategory } from '../services/routineRepo';

export interface PracticeCatalogItem {
  id: string;
  name: string;
  sanskrit?: string;
  benefit?: string;
  durationSec: number;
  category: string;
}

interface Props {
  /** Practice category — drives both the button label and the routine filter. */
  practice: 'yoga' | 'meditation';
  /** Full built-in catalog (YOGA_CATALOG / MEDITATION_CATALOG). */
  catalog: PracticeCatalogItem[];
  /** Tap handler — receives the chosen item (catalog item OR a synthetic
   *  RoutineItem-shaped object for custom Sadhana Paths). */
  onSelect: (item: PracticeCatalogItem) => void;
  /** Optional icon helper for catalog category → emoji. */
  iconFor?: (category: string) => string;
}

const fmtSec = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} min` : `${m}:${s.toString().padStart(2, '0')}`;
};

export const PracticeAssistant: React.FC<Props> = ({
  practice, catalog, onSelect, iconFor,
}) => {
  const [open, setOpen] = useState(false);
  const [customs, setCustoms] = useState<RoutineItem[]>([]);

  // Map UI practice to RoutineCategory.
  // Yoga assistant shows yoga; Meditation assistant shows both meditate +
  // sandhya since both are inward practices.
  const cats: RoutineCategory[] = practice === 'yoga'
    ? ['yoga']
    : ['meditate', 'sandhya'];

  useEffect(() => {
    if (!open) return;
    (async () => {
      const all = await routineRepo.list();
      setCustoms(all.filter(r => cats.includes(r.category) && r.steps && r.steps.length > 0));
    })();
  }, [open]);

  const buttonLabel = practice === 'yoga'
    ? '🧘‍♀️  Yoga Assistant'
    : '🪷  Meditation Assistant';

  const buttonSub = practice === 'yoga'
    ? 'Tap to see all asanas, pranayama + your Sadhana Paths'
    : 'Tap to see all techniques + your Sadhana Paths';

  return (
    <>
      <TouchableOpacity
        style={styles.assistantBtn}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.assistantBtnLabel}>{buttonLabel}</Text>
          <Text style={styles.assistantBtnSub}>{buttonSub}</Text>
        </View>
        <Text style={styles.assistantBtnChev}>›</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{buttonLabel}</Text>
              <Text style={styles.modalSub}>
                {customs.length} of yours · {catalog.length} in library
              </Text>
            </View>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setOpen(false)}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
            {/* ── User's custom Sadhana Paths ── */}
            {customs.length > 0 && (
              <View>
                <Text style={styles.sectionLabel}>🪷  YOUR SADHANA PATHS</Text>
                {customs.map(c => {
                  const totalMin = (c.steps ?? []).reduce(
                    (s, st) => s + (st.unit === 'min' ? st.value : 0), 0
                  );
                  const synthetic: PracticeCatalogItem = {
                    id: c.id,
                    name: c.name,
                    sanskrit: `Custom · ${(c.steps ?? []).length} steps`,
                    benefit: (c.steps ?? []).slice(0, 3).map(s => s.name).join(' · '),
                    durationSec: totalMin * 60,
                    category: c.category,
                  };
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.itemRow, styles.customItemRow]}
                      onPress={() => { setOpen(false); onSelect(synthetic); }}
                    >
                      <Text style={styles.itemIcon}>🪷</Text>
                      <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                        <Text style={styles.itemName}>{c.name}</Text>
                        <Text style={styles.itemSanskrit}>
                          Custom · {(c.steps ?? []).length} steps
                        </Text>
                        <Text style={styles.itemBenefit} numberOfLines={2}>
                          {synthetic.benefit}
                        </Text>
                      </View>
                      <Text style={styles.itemDur}>{totalMin || c.durationMin} min</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Built-in catalog ── */}
            <Text style={styles.sectionLabel}>
              {practice === 'yoga' ? '🧘 ASANAS · PRANAYAMA · LIBRARY' : '🪷 MEDITATION LIBRARY'}
            </Text>
            {catalog.map(i => (
              <TouchableOpacity
                key={i.id}
                style={styles.itemRow}
                onPress={() => { setOpen(false); onSelect(i); }}
              >
                <Text style={styles.itemIcon}>{iconFor?.(i.category) ?? '🧘'}</Text>
                <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                  <Text style={styles.itemName}>{i.name}</Text>
                  {!!i.sanskrit && (
                    <Text style={styles.itemSanskrit}>{i.sanskrit}</Text>
                  )}
                  {!!i.benefit && (
                    <Text style={styles.itemBenefit} numberOfLines={2}>{i.benefit}</Text>
                  )}
                </View>
                <Text style={styles.itemDur}>{fmtSec(i.durationSec)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  // ── Single CTA button on the parent screen ──
  assistantBtn: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.gold,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
  },
  assistantBtnLabel: {
    color: COLORS.gold, fontSize: 17, fontWeight: '800', letterSpacing: 0.3,
  },
  assistantBtnSub: {
    color: COLORS.muted, fontSize: 12, marginTop: 3, fontWeight: '500',
  },
  assistantBtnChev: {
    color: COLORS.gold, fontSize: 28, fontWeight: '700', paddingHorizontal: 6,
  },

  // ── Modal ──
  modalContainer: { flex: 1, backgroundColor: COLORS.deep, paddingTop: 48 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  modalTitle:  { fontSize: 20, color: COLORS.cream, fontWeight: '700' },
  modalSub:    { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  modalCloseBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.cardBg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  modalCloseText: { color: COLORS.cream, fontSize: 18, fontWeight: '700' },

  sectionLabel: {
    fontSize: 12, color: COLORS.gold, fontWeight: '800', letterSpacing: 1,
    marginTop: SPACING.md, marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },

  // ── Item rows in the modal ──
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACING.md, marginBottom: 8,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    minHeight: 72,
  },
  customItemRow: { borderColor: 'rgba(255, 184, 0, 0.45)' },
  itemIcon: { fontSize: 26, width: 32, textAlign: 'center' },
  itemName: { fontSize: 16, color: COLORS.cream, fontWeight: '700' },
  itemSanskrit: { fontSize: 12, color: COLORS.gold, fontStyle: 'italic', marginTop: 2 },
  itemBenefit:  { fontSize: 12, color: COLORS.muted, marginTop: 2, lineHeight: 16 },
  itemDur:   { fontSize: 14, color: COLORS.gold, fontWeight: '700', marginLeft: SPACING.sm },
});
