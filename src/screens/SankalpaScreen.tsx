/**
 * SankalpaScreen — your daily resolve.
 *
 * Sankalpa (संकल्प) is the Sanskrit word for "intention" or "vow" —
 * the inner commitment that organizes a sadhaka's day. This screen
 * lets the user PLAN their routine instead of just react to it.
 *
 * Layout:
 *   • 💬 AI chat strip — type a sentence; the parser turns it into items
 *   • 📅 Today's plan — chronological list of what to do today
 *   • ⚙️  My Routine — expandable cards per category
 *   • 💡 AI Recommends — daily contextual suggestions
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Platform, Switch,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { useSadhana } from '../context';
import { routineRepo, RoutineItem, RoutineCategory } from '../services/routineRepo';
import { routineParser } from '../soulsync/ai/RoutineParser';
import { vitalsPlanEngine, VitalsPlan } from '../soulsync/ai/VitalsPlanEngine';
import { FamilyMembersCard } from '../components/FamilyMembersCard';
import { TimePickerField } from '../components/TimePickerField';
import { YOGA_CATALOG } from './YogaScreen';
import { EXERCISE_CATALOG } from './ExerciseScreen';
import { MEDITATION_CATALOG } from './MeditationScreen';
import { ALL_CATALOG_DEITIES } from '../deityCatalog';
import {
  scheduleRoutineReminder, cancelRoutineReminder, requestNotificationPermission,
} from '../services/notifications';

// Festival → built-in shopping / prep checklist
const FESTIVAL_PREP: Record<string, string[]> = {
  diwali: [
    'Diyas / clay lamps (12+)', 'Cotton wicks', 'Sesame oil or ghee',
    'Rangoli powder / flower petals', 'Sweets (laddoo, barfi)',
    'Dry fruits for prasad', 'New clothes', 'Toran (mango leaves)',
    'Lakshmi-Ganesh murti / photo', 'Camphor + agarbatti',
  ],
  navratri: [
    '9 days of fasting groceries (sabudana, fruits, kuttu)',
    'Devi murti / photo', 'Akhand jyot oil', 'Coconut',
    'Red chunari', 'Garba / Dandiya sticks', 'Flowers (red)',
  ],
  shivratri: [
    'Bel patra (3-leaf)', 'Datura flowers', 'White flowers',
    'Bhang / thandai ingredients', 'Milk / curd / honey for abhishek',
    'Black sesame', 'Rudraksha', 'Sleep-light / camphor',
  ],
  ekadashi: [
    'Fruits (variety)', 'Sabudana', 'Sendha namak (rock salt)',
    'Tulsi leaves', 'Coconut', 'Light snacks (fasting-allowed)',
  ],
  pradosh: [
    'Bel patra', 'White flowers', 'Milk for abhishek',
    'Sandalwood paste', 'Sesame oil lamp',
  ],
};

// Catalog entry shown in the Add-Item picker. Unified shape across
// yoga / exercise / meditation / japa.
interface CatalogEntry {
  id: string;
  icon: string;
  name: string;
  sub: string;
  defaultMin: number;
}

// Special sentinel entry — when picked, the user designs a multi-step
// Sadhana Path (a kriya, japa flow, workout circuit, etc.).
const OTHER_ENTRY: CatalogEntry = {
  id: '__other__', icon: '🪷',
  name: 'Sadhana Path',
  sub: 'Design your own multi-step routine',
  defaultMin: 15,
};

// Tithi options (special sadhana days — reused for both the Tithi category
// step picker and the shared form below).
const TITHI_OPTIONS: CatalogEntry[] = [
  { id: 'ekadashi',  icon: '🌗', name: 'Ekadashi',  sub: 'Every 11th lunar day · fast + japa', defaultMin: 30 },
  { id: 'pradosh',   icon: '🌘', name: 'Pradosh',   sub: 'Shiva tithi · evening worship',      defaultMin: 30 },
  { id: 'purnima',   icon: '🌕', name: 'Purnima',   sub: 'Full moon · meditation',             defaultMin: 30 },
  { id: 'amavasya',  icon: '🌑', name: 'Amavasya',  sub: 'New moon · pitru tarpana',           defaultMin: 30 },
  { id: 'sankashti', icon: '🐘', name: 'Sankashti', sub: 'Ganesha tithi · 4th day after full', defaultMin: 30 },
];

// Per-category unit for custom-path steps
const STEP_UNIT_FOR: Record<RoutineCategory, 'min' | 'malas'> = {
  yoga: 'min', exercise: 'min', meditate: 'min', sandhya: 'min',
  shraadha: 'min', tithi: 'min', festival: 'min', japa: 'malas',
};

// Per-category label for the step-picker dropdown button
const STEP_PICKER_LABEL: Record<RoutineCategory, string> = {
  japa:     'Pick a deity from list',
  yoga:     'Pick an asana / pranayama',
  exercise: 'Pick a workout',
  meditate: 'Pick a meditation technique',
  sandhya:  'Pick a sandhya juncture',
  shraadha: 'Add a family member',
  tithi:    'Pick a special tithi',
  festival: 'Pick a festival',
};

// Options shown inside the step-picker dropdown — sourced from the
// existing per-tab catalogs so Plan stays in sync with the libraries.
const STEP_OPTIONS_FOR: Record<RoutineCategory, () => CatalogEntry[]> = {
  japa:     () => ALL_CATALOG_DEITIES.map((d: any) => ({
    id: d.id, icon: d.icon || '🪷', name: d.name, sub: d.mantra || '', defaultMin: 1,
  })),
  yoga:     () => YOGA_CATALOG.map(yogaToCatalog),
  exercise: () => EXERCISE_CATALOG.map(exerciseToCatalog),
  meditate: () => MEDITATION_CATALOG.map(meditationToCatalog),
  sandhya:  () => [
    { id: 'pratah',      icon: '🌅', name: 'Pratah Sandhya',      sub: 'Dawn juncture',   defaultMin: 10 },
    { id: 'madhyahnika', icon: '🌞', name: 'Madhyahnika Sandhya', sub: 'Noon juncture',   defaultMin: 10 },
    { id: 'sayam',       icon: '🌇', name: 'Sayam Sandhya',       sub: 'Dusk juncture',   defaultMin: 10 },
  ],
  shraadha: () => [],   // Shraadha uses the FamilyMembersCard form directly
  tithi:    () => TITHI_OPTIONS,
  festival: () => CATALOG_FOR.festival(),
};

// Special "Other / Custom" sentinel that appears at the bottom of every
// step-picker dropdown. Tapping it clears the input so the user can
// freely type their own deity / pose / technique name.
const OTHER_STEP_ID = '__other_step__';

// Per-category friendly label for the Sadhana Path UI
const CUSTOM_PATH_LABEL: Record<RoutineCategory, string> = {
  yoga:     'Sadhana Path — sequence of asanas / pranayama',
  exercise: 'Sadhana Path — multi-step body circuit',
  meditate: 'Sadhana Path — multi-stage meditation flow',
  sandhya:  'Sadhana Path — custom sandhya sequence',
  shraadha: 'Sadhana Path — custom shraadha rites',
  tithi:    'Sadhana Path — custom tithi observance',
  festival: 'Sadhana Path — custom festival ritual',
  japa:     'Sadhana Path — Ganapathi → Guru → Ishta → ...',
};

const yogaToCatalog = (i: any): CatalogEntry => ({
  id: i.id, icon: '🧘', name: i.name, sub: i.sanskrit || '',
  defaultMin: Math.max(1, Math.round((i.durationSec || 600) / 60)),
});
const exerciseToCatalog = (i: any): CatalogEntry => ({
  id: i.id, icon: i.icon, name: i.name, sub: i.subtitle || '',
  defaultMin: Math.max(1, Math.round((i.durationSec || 1800) / 60)),
});
const meditationToCatalog = (i: any): CatalogEntry => ({
  id: i.id, icon: '🪷', name: i.name, sub: i.subtitle || '',
  defaultMin: Math.max(1, Math.round((i.durationSec || 600) / 60)),
});
const deityToCatalog = (d: any): CatalogEntry => ({
  id: d.id, icon: d.icon || '🪷', name: `${d.name} Japa`, sub: d.mantra || '',
  defaultMin: 10,
});

const CATALOG_FOR: Record<RoutineCategory, () => CatalogEntry[]> = {
  yoga:     () => YOGA_CATALOG.map(yogaToCatalog),
  exercise: () => EXERCISE_CATALOG.map(exerciseToCatalog),
  meditate: () => MEDITATION_CATALOG.map(meditationToCatalog),
  japa:     () => ALL_CATALOG_DEITIES.map(deityToCatalog),
  sandhya:  () => [
    { id: 'pratah',      icon: '🌅', name: 'Pratah Sandhya',      sub: 'Dawn juncture',      defaultMin: 10 },
    { id: 'madhyahnika', icon: '🌞', name: 'Madhyahnika Sandhya', sub: 'Noon juncture',      defaultMin: 10 },
    { id: 'sayam',       icon: '🌇', name: 'Sayam Sandhya',       sub: 'Dusk juncture',      defaultMin: 10 },
  ],
  // Shraadha is "people" data — handled by the FamilyMembersCard form
  // rendered inline in the category card. No flat catalog needed.
  shraadha: () => [],
  // Tithi reuses the shared list above (Ekadashi, Pradosh, etc.).
  tithi: () => TITHI_OPTIONS,
  festival: () => [
    { id: 'ekadashi',  icon: '🛕', name: 'Ekadashi (every 11th tithi)', sub: 'Fast + special japa', defaultMin: 30 },
    { id: 'pradosh',   icon: '🛕', name: 'Pradosh (Shiva tithi)',       sub: 'Evening Shiva worship', defaultMin: 30 },
    { id: 'shivratri', icon: '🛕', name: 'Maha Shivratri',              sub: 'Night-long jagaran',   defaultMin: 60 },
    { id: 'navratri',  icon: '🛕', name: 'Navratri',                    sub: '9-night Devi worship', defaultMin: 45 },
    { id: 'diwali',    icon: '🛕', name: 'Diwali',                      sub: 'Lakshmi puja',         defaultMin: 30 },
  ],
};

// Category meta for cards. Order = display order in the "My Goals" list.
//
// v47: shraadha · tithi · festival moved out of the Plan tab — those
// reminders are now managed in the Festivals (Panchang) tab so the user
// has ONE place for calendar-driven sadhana and ONE place for daily
// routine.  Keep the keys in the type so existing saved data doesn't
// throw, but PLAN_CATEGORIES below drives what renders on this screen.
const CATEGORY_META: Record<RoutineCategory, { label: string; icon: string; color: string }> = {
  exercise: { label: 'Exercise',         icon: '🏃',   color: '#4ea8de' },
  yoga:     { label: 'Yoga',             icon: '🧘‍♀️', color: '#FFB800' },
  japa:     { label: 'Japa',             icon: '📿',   color: '#FF8C42' },
  sandhya:  { label: 'Sandhya Vandan',   icon: '🌅',   color: '#FFD9A8' },
  meditate: { label: 'Meditate',         icon: '🪷',   color: '#c084fc' },
  // Below this line are LEGACY meta entries kept only so saved items in
  // these categories still display if they exist in storage. They are
  // NOT shown in the Plan-your-well-being category cards.
  shraadha: { label: 'Shraadha',         icon: '🕯️',   color: '#a78bfa' },
  tithi:    { label: 'Tithi observance', icon: '🌗',   color: '#94a3b8' },
  festival: { label: 'Festivals',        icon: '🛕',  color: '#f472b6' },
};

// Daily-routine categories shown in the "My Goals" cards list.
const PLAN_CATEGORIES: RoutineCategory[] =
  ['exercise', 'yoga', 'japa', 'sandhya', 'meditate'];

// ─── Cross-platform Time + Reminder block ────────────────────────
//
// Native (Android/iOS): real DateTimePicker in "clock" mode opens on tap.
// Web preview: a free-form HH:MM TextInput (since @react-native-community/
// datetimepicker doesn't render on react-native-web). Either way, the
// "Enable reminder" Switch gates whether a notification is scheduled.

const ReminderBlock: React.FC<{
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  time: string | null;
  onTimeChange: (t: string | null) => void;
}> = ({ enabled, onEnabledChange, time, onTimeChange }) => {

  return (
    <View style={{ marginTop: 4 }}>
      {/* Toggle row */}
      <View style={styles.reminderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetFieldLabel}>🔔  Enable reminder</Text>
          <Text style={styles.reminderHint}>
            {enabled
              ? (time ? `Will fire at ${time} based on the frequency above` : 'Pick a time below to schedule')
              : 'No notification will be scheduled for this item'}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={(v) => { onEnabledChange(v); if (v && !time) onTimeChange('07:00'); }}
          trackColor={{ false: COLORS.border, true: COLORS.gold }}
          thumbColor={enabled ? COLORS.cream : COLORS.muted}
        />
      </View>

      {/* Time selector — uses the unified TimePickerField */}
      {enabled && (
        <View style={{ marginTop: 6 }}>
          <TimePickerField
            label="Time"
            value={time}
            onChange={onTimeChange}
            placeholder="Tap to open clock"
          />
        </View>
      )}
    </View>
  );
};

const fmtFrequency = (f: 'daily' | number[]): string => {
  if (f === 'daily') return 'Daily';
  const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return f.map(d => names[d]).join(' · ');
};

export const SankalpaScreen = ({ navigation }: any) => {
  const { showToast, userProfile } = useSadhana();
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [parsedPreview, setParsedPreview] = useState<ReturnType<typeof routineParser.parse>>([]);
  const [expandedCategory, setExpandedCategory] = useState<RoutineCategory | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddSheet, setShowAddSheet] = useState<RoutineCategory | null>(null);
  const [showSandhyaInfo, setShowSandhyaInfo] = useState(false);

  // ── AI personalized plan (vitals + age + 7-day history) ──
  const [aiPlan, setAiPlan] = useState<VitalsPlan | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await vitalsPlanEngine.generate(userProfile?.dob);
        if (!cancelled) setAiPlan(p);
      } catch { /* soft-fail — card simply hides */ }
    })();
    return () => { cancelled = true; };
  }, [userProfile?.dob]);

  // Live clock — refreshes "in 2h 15m" countdowns once a minute
  const [, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const refresh = async () => setItems(await routineRepo.list());
  useEffect(() => { refresh(); }, []);

  const todayItems = React.useMemo(() => {
    const dow = new Date().getDay();
    return items
      .filter(e => e.frequency === 'daily' || (Array.isArray(e.frequency) && e.frequency.includes(dow)))
      .sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time);
        if (a.time) return -1;
        if (b.time) return 1;
        return 0;
      });
  }, [items]);

  // Compute which item is "next up" + human time-until each one
  const { nextItemId, timeUntilMap } = React.useMemo(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const minsByItem: Record<string, number | null> = {};
    let nextId: string | null = null;
    let bestDelta = Infinity;
    for (const t of todayItems) {
      if (!t.time) { minsByItem[t.id] = null; continue; }
      const [h, m] = t.time.split(':');
      const itemMin = (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
      const delta = itemMin - nowMin;
      minsByItem[t.id] = delta;
      if (delta >= 0 && delta < bestDelta) {
        bestDelta = delta;
        nextId = t.id;
      }
    }
    return { nextItemId: nextId, timeUntilMap: minsByItem };
  }, [todayItems, /* ticks via setNowTick */ items]);

  const fmtUntil = (deltaMin: number | null): string => {
    if (deltaMin === null) return 'Anytime';
    if (deltaMin < -60) return `${Math.round(-deltaMin / 60)}h ago`;
    if (deltaMin < 0)   return `${-deltaMin} min ago`;
    if (deltaMin === 0) return 'now';
    if (deltaMin < 5)   return `in ${deltaMin} min — soon!`;
    if (deltaMin < 60)  return `in ${deltaMin} min`;
    const h = Math.floor(deltaMin / 60);
    const m = deltaMin % 60;
    return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
  };

  const nextItem = todayItems.find(t => t.id === nextItemId);
  const itemsWithReminders = items.filter(i => i.notificationIds).length;

  const byCategory = React.useMemo(() => {
    const acc: Record<RoutineCategory, RoutineItem[]> = {
      exercise: [], yoga: [], japa: [], meditate: [], sandhya: [],
      shraadha: [], tithi: [], festival: [],
    };
    for (const e of items) acc[e.category].push(e);
    return acc;
  }, [items]);

  const totalCommittedMin = React.useMemo(() => {
    let mins = 0;
    for (const e of items) {
      if (e.frequency === 'daily') mins += e.durationMin;
      else if (Array.isArray(e.frequency)) mins += e.durationMin * (e.frequency.length / 7);
    }
    return Math.round(mins);
  }, [items]);

  // ── AI chat ──
  const handleParseInput = () => {
    if (!chatInput.trim()) return;
    const parsed = routineParser.parse(chatInput);
    if (parsed.length === 0) {
      showToast("Couldn't read that — try: '30 min walk daily'");
      return;
    }
    setParsedPreview(parsed);
  };

  const handleConfirmParsed = async () => {
    for (const p of parsedPreview) {
      const added = await routineRepo.add({
        category: p.category,
        name: p.name,
        durationMin: p.durationMin,
        time: p.time ?? null,
        frequency: p.frequency,
        custom: p.custom,
      });
      // If time is set, schedule a reminder
      if (p.time) {
        const granted = await requestNotificationPermission();
        if (granted) {
          const ids = await scheduleRoutineReminder({
            title: `🎯 ${p.name}`,
            body: `Your committed ${p.durationMin}-min practice`,
            time: p.time,
            frequency: p.frequency,
            routineId: added.id,
          });
          await routineRepo.update(added.id, { notificationIds: ids });
        }
      }
    }
    showToast(`✓ Added ${parsedPreview.length} item${parsedPreview.length === 1 ? '' : 's'}`);
    setParsedPreview([]); setChatInput('');
    refresh();
  };

  const handleDelete = async (id: string) => {
    const item = items.find(x => x.id === id);
    if (item?.notificationIds) await cancelRoutineReminder(item.notificationIds);
    await routineRepo.remove(id);
    refresh();
  };

  const togglePrep = async (itemId: string, idx: number) => {
    const item = items.find(x => x.id === itemId);
    if (!item?.prepList) return;
    const next = item.prepList.map((p, i) =>
      i === idx ? { ...p, done: !p.done } : p
    );
    await routineRepo.update(itemId, { prepList: next });
    refresh();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header — title + close button (Plan is reached from Home CTA;
            no bottom-tab entry exists, so we expose a × to return.) */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Plan · Your Well-Being</Text>
              <Text style={styles.subtitle}>
                Body + soul, every day · {totalCommittedMin} min committed
              </Text>
            </View>
            <TouchableOpacity
              style={styles.planCloseBtn}
              onPress={() => navigation?.navigate?.('Dashboard')}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Text style={styles.planCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 1. AI Personalized Plan — FIRST (rearranged in v47) ── */}
        {aiPlan && (
          <View style={styles.aiPlanCard}>
            <View style={styles.aiPlanHeaderRow}>
              <Text style={styles.aiPlanTitle}>🌿  YOUR WELL-BEING PLAN — TUNED TODAY</Text>
              <Text style={styles.aiPlanTotal}>{aiPlan.totalMin} min</Text>
            </View>
            <Text style={styles.aiPlanSub}>
              Tuned to your age, today's vitals, and last-7-day history.
            </Text>

            {aiPlan.notes.map((n, i) => (
              <Text key={i} style={styles.aiPlanNote}>• {n}</Text>
            ))}

            <View style={styles.aiPlanBuckets}>
              <PlanBucketRow icon="🚶" label="Walking"     mins={aiPlan.walkingMin} />
              <PlanBucketRow icon="🧘" label="Yoga"        mins={aiPlan.yogaMin} />
              <PlanBucketRow icon="📿" label="Japa"        mins={aiPlan.japaMin} />
              <PlanBucketRow icon="🪷" label="Meditation"  mins={aiPlan.meditationMin} />
              <PlanBucketRow icon="🫁" label="Breath work" mins={aiPlan.breathworkMin} />
            </View>

            <TouchableOpacity onPress={() => setShowWhy(s => !s)} style={styles.aiPlanWhyBtn}>
              <Text style={styles.aiPlanWhyText}>
                {showWhy ? '▾  Hide reasoning' : '▸  Why this plan?'}
              </Text>
            </TouchableOpacity>
            {showWhy && (
              <View style={styles.aiPlanRationaleBox}>
                {aiPlan.rationale.map((r, i) => (
                  <Text key={i} style={styles.aiPlanRationaleLine}>· {r}</Text>
                ))}
                <Text style={styles.aiPlanProvenance}>
                  {aiPlan.fromRealVitals ? '✓ Live ring vitals' : '◌ Vitals fallback (ring not synced yet)'}
                  {'  ·  '}
                  {aiPlan.fromRealHistory ? '✓ 7-day history' : '◌ No history yet'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── 2. Type-in-plan chat parser (was at the top before v47) ── */}
        <View style={styles.chatCard}>
          <Text style={styles.chatLabel}>💬 TELL ME YOUR ROUTINE</Text>
          <Text style={styles.chatHint}>
            Type in plain English. Example: "30 min walk daily, Gayatri 1 mala morning"
          </Text>
          <View style={styles.chatRow}>
            <TextInput
              style={styles.chatInput}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="20 min walk, 5 min box breath before sleep…"
              placeholderTextColor={COLORS.muted}
              multiline
            />
            <TouchableOpacity style={styles.chatSendBtn} onPress={handleParseInput}>
              <Text style={styles.chatSendText}>↑</Text>
            </TouchableOpacity>
          </View>

          {/* Parsed preview — confirm before saving */}
          {parsedPreview.length > 0 && (
            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>
                I read this as {parsedPreview.length} item{parsedPreview.length === 1 ? '' : 's'} — confirm?
              </Text>
              {parsedPreview.map((p, i) => (
                <View key={i} style={styles.previewRow}>
                  <Text style={styles.previewIcon}>{CATEGORY_META[p.category].icon}</Text>
                  <Text style={styles.previewText}>
                    <Text style={{ fontWeight: '700' }}>{p.name}</Text>
                    {' '}· {p.durationMin} min · {fmtFrequency(p.frequency)}
                    {p.time && ` · ${p.time}`}
                  </Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
                <TouchableOpacity style={styles.previewCancel} onPress={() => setParsedPreview([])}>
                  <Text style={styles.previewCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.previewConfirm} onPress={handleConfirmParsed}>
                  <Text style={styles.previewConfirmText}>Add to routine</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Today's plan — clearly shows next reminder + multi-step paths */}
        <View style={styles.todaySectionHeader}>
          <Text style={styles.sectionLabelInline}>📅 TODAY'S ROUTINE</Text>
          {todayItems.length > 0 && (
            <Text style={styles.todayHeaderMeta}>
              {todayItems.length} item{todayItems.length === 1 ? '' : 's'}
              {itemsWithReminders > 0 && ` · 🔔 ${itemsWithReminders}`}
              {nextItem?.time && ` · next ${nextItem.time}`}
            </Text>
          )}
        </View>

        {todayItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              Nothing planned yet. Type your routine above, or tap a category card below to add.
            </Text>
          </View>
        ) : (
          <View>
            {/* Highlighted "next up" hero (only if a future item has a time) */}
            {nextItem && (
              <View style={styles.nextUpCard}>
                <View style={styles.nextUpBadge}>
                  <Text style={styles.nextUpBadgeText}>
                    🔔  NEXT UP · {fmtUntil(timeUntilMap[nextItem.id])}
                  </Text>
                </View>
                <View style={styles.nextUpRow}>
                  <Text style={styles.nextUpTime}>{nextItem.time}</Text>
                  <Text style={styles.nextUpIcon}>{CATEGORY_META[nextItem.category].icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nextUpName}>{nextItem.name}</Text>
                    <Text style={styles.nextUpSub}>
                      {nextItem.durationMin} min
                      {nextItem.notificationIds && ' · 🔔 reminder on'}
                      {nextItem.steps && ` · 🪷 Sadhana Path (${nextItem.steps.length} steps)`}
                    </Text>
                    {/* Step preview — first 3 steps */}
                    {nextItem.steps && nextItem.steps.length > 0 && (
                      <View style={styles.nextUpSteps}>
                        {nextItem.steps.slice(0, 3).map((s, i) => (
                          <Text key={i} style={styles.nextUpStepLine}>
                            {i + 1}. {s.name} · {s.value} {s.unit}
                          </Text>
                        ))}
                        {nextItem.steps.length > 3 && (
                          <Text style={styles.nextUpStepLine}>
                            …and {nextItem.steps.length - 3} more
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}

            {/* All other today items as compact rows */}
            <View style={styles.todayCard}>
              {todayItems
                .filter(t => t.id !== nextItemId)
                .map((t, i, arr) => (
                  <View
                    key={t.id}
                    style={[styles.todayRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                  >
                    <Text style={styles.todayTime}>{t.time || 'Anytime'}</Text>
                    <Text style={styles.todayIcon}>{CATEGORY_META[t.category].icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.todayName}>
                        {t.name}
                        {t.notificationIds && <Text style={styles.itemBell}>  🔔</Text>}
                      </Text>
                      <Text style={styles.todaySub}>
                        {t.durationMin} min
                        {t.steps && ` · 🪷 ${t.steps.length}-step path`}
                        {t.time && ` · ${fmtUntil(timeUntilMap[t.id])}`}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDelete(t.id)}>
                      <Text style={styles.todayDelete}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
            </View>
          </View>
        )}

        {/* ── 3. My Routine — manual add + categorical cards ── */}
        <Text style={styles.sectionLabel}>🎯  MANUALLY ADD · TAP A CATEGORY</Text>
        {PLAN_CATEGORIES.map(cat => {
          const meta = CATEGORY_META[cat];
          const catItems = byCategory[cat];
          const expanded = expandedCategory === cat;
          return (
            <View key={cat} style={styles.catCard}>
              <TouchableOpacity
                style={styles.catHeader}
                onPress={() => setExpandedCategory(expanded ? null : cat)}
                activeOpacity={0.7}
              >
                <Text style={styles.catIcon}>{meta.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.catLabel}>{meta.label}</Text>
                  <Text style={styles.catSummary}>
                    {catItems.length === 0
                      ? 'No items yet · tap to add'
                      : `${catItems.length} item${catItems.length === 1 ? '' : 's'} · ${catItems.reduce((s, x) => s + (x.frequency === 'daily' ? x.durationMin : 0), 0)} min daily`}
                  </Text>
                </View>
                {cat === 'sandhya' && (
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation?.(); setShowSandhyaInfo(true); }}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    style={{ paddingHorizontal: 8 }}
                  >
                    <Text style={{ fontSize: 18, color: COLORS.gold }}>ℹ️</Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.catChevron}>{expanded ? '−' : '+'}</Text>
              </TouchableOpacity>

              {expanded && cat === 'shraadha' && (
                // Shraadha reuses the existing family-members form that
                // already lives in FestivalScreen. Same code path so
                // entries computed here flow through to the panchang
                // calendar via the shared familyRepo + buildCalendar.
                <View style={[styles.catExpanded, { paddingHorizontal: 0 }]}>
                  <Text style={styles.shraadhaHint}>
                    Add family members whose annual shraddha you observe. The app
                    auto-computes the tithi from death-date + city and schedules
                    a reminder for the next observance.
                  </Text>
                  <FamilyMembersCard />
                </View>
              )}

              {expanded && cat !== 'shraadha' && (
                <View style={styles.catExpanded}>
                  {catItems.map(it => (
                    <View key={it.id}>
                      <View style={styles.itemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemName}>
                            {it.name}
                            {it.notificationIds && <Text style={styles.itemBell}>  🔔</Text>}
                          </Text>
                          <Text style={styles.itemMeta}>
                            {it.durationMin} min · {fmtFrequency(it.frequency)}
                            {it.time && ` · ⏰ ${it.time}`}
                          </Text>
                        </View>
                        <TouchableOpacity onPress={() => setEditingId(it.id)}>
                          <Text style={styles.itemAction}>edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(it.id)}>
                          <Text style={[styles.itemAction, { color: COLORS.error }]}>✕</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Sadhana Path — multi-step display */}
                      {it.steps && it.steps.length > 0 && (
                        <View style={styles.prepBox}>
                          <Text style={styles.prepLabel}>
                            🪷 SADHANA PATH · {it.steps.length} STEP{it.steps.length === 1 ? '' : 'S'}
                          </Text>
                          {it.steps.map((s, idx) => (
                            <View key={idx} style={styles.prepRow}>
                              <Text style={styles.prepCheck}>{idx + 1}.</Text>
                              <Text style={styles.prepItem}>{s.name}</Text>
                              <Text style={[styles.prepItem, { flex: 0, color: COLORS.gold, fontWeight: '700' }]}>
                                {s.value} {s.unit}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Festival prep / shopping list */}
                      {it.prepList && it.prepList.length > 0 && (
                        <View style={styles.prepBox}>
                          <Text style={styles.prepLabel}>
                            🛒 PREP LIST · {it.prepList.filter(p => p.done).length} / {it.prepList.length}
                          </Text>
                          {it.prepList.map((p, idx) => (
                            <TouchableOpacity
                              key={idx}
                              style={styles.prepRow}
                              onPress={() => togglePrep(it.id, idx)}
                            >
                              <Text style={styles.prepCheck}>{p.done ? '☑' : '☐'}</Text>
                              <Text style={[styles.prepItem, p.done && styles.prepItemDone]}>
                                {p.item}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddSheet(cat)}>
                    <Text style={styles.addBtnText}>+ Add {meta.label.toLowerCase()} item</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {/* AI Recommends */}
        <Text style={styles.sectionLabel}>💡 AI SUGGESTS — BASED ON YOUR ROUTINE</Text>
        <View style={styles.recCard}>
          {totalCommittedMin === 0 && (
            <Text style={styles.recText}>
              Start small: <Text style={styles.recBold}>"15 min walk daily + 5 min box breath"</Text>{'\n'}
              Anchor the day with one body + one soul practice.
            </Text>
          )}
          {totalCommittedMin > 0 && totalCommittedMin < 30 && (
            <Text style={styles.recText}>
              Beautiful start at {totalCommittedMin} min. Consider adding a 10-min{' '}
              <Text style={styles.recBold}>evening practice</Text> — body settles into sleep more cleanly.
            </Text>
          )}
          {totalCommittedMin >= 30 && totalCommittedMin < 60 && (
            <Text style={styles.recText}>
              {totalCommittedMin} min is a strong daily commitment. To deepen, add{' '}
              <Text style={styles.recBold}>Sandhya twilight reminders</Text> so body & soul rhythm-sync to the sun.
            </Text>
          )}
          {totalCommittedMin >= 60 && (
            <Text style={styles.recText}>
              {totalCommittedMin} min/day is profound. Don't overcommit — protect{' '}
              <Text style={styles.recBold}>recovery days</Text> so the practice stays joyful, not heavy.
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Add item sheet */}
      {showAddSheet && (
        <AddItemSheet
          category={showAddSheet}
          onClose={() => setShowAddSheet(null)}
          onAdded={() => { setShowAddSheet(null); refresh(); }}
        />
      )}

      {/* Sandhya info modal — opened from the ℹ️ icon next to the Sandhya
          category. Brings the SandhyaScreen content here so the user
          doesn't need to switch tabs to learn what each juncture is. */}
      <Modal
        visible={showSandhyaInfo}
        transparent animationType="slide"
        onRequestClose={() => setShowSandhyaInfo(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { maxHeight: '88%' }]}>
            <View style={styles.sheetHandle} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm }}>
              <Text style={styles.sheetTitle}>🌅  Sandhya Vandanam</Text>
              <TouchableOpacity onPress={() => setShowSandhyaInfo(false)}>
                <Text style={{ color: COLORS.muted, fontSize: 20 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sandhyaIntro}>
                The 3 daily junctures — dawn, noon, dusk — where the day's
                rhythm meets the cosmos. Performed by initiated Hindus
                (dvija) after upanayana, but the breath-and-water core
                is open to anyone.
              </Text>

              <View style={styles.sandhyaInfoBox}>
                <Text style={styles.sandhyaName}>🌅  Pratah Sandhya</Text>
                <Text style={styles.sandhyaWhen}>Before sunrise · Brahma Muhurta → Sunrise</Text>
                <Text style={styles.sandhyaWhat}>
                  Achamana · Pranayama · Sankalpa · Argya to the rising Sun ·
                  Gayatri Japa (108).
                </Text>
              </View>

              <View style={styles.sandhyaInfoBox}>
                <Text style={styles.sandhyaName}>🌞  Madhyahnika Sandhya</Text>
                <Text style={styles.sandhyaWhen}>Solar noon · ~11:30 – 12:30 local</Text>
                <Text style={styles.sandhyaWhat}>
                  Short midday version — Achamana · Argya to the overhead
                  Sun · 28 or 108 Gayatri.
                </Text>
              </View>

              <View style={styles.sandhyaInfoBox}>
                <Text style={styles.sandhyaName}>🌇  Sayam Sandhya</Text>
                <Text style={styles.sandhyaWhen}>Just after sunset · until stars appear</Text>
                <Text style={styles.sandhyaWhat}>
                  Achamana · Argya to the setting Sun · Gayatri (108) ·
                  followed by Aupasana / evening prayer.
                </Text>
              </View>

              <Text style={styles.sandhyaSection}>PREREQUISITES</Text>
              {[
                'Bath, or face-hands-feet wash if short on time',
                'Rinse mouth with water (3 times)',
                'Clean clothes — cotton preferred',
                'Tilak / kumkum / vibhuti if you have it',
                'A good seat — chair, cushion, yoga mat',
                'A small vessel of clean water for achamana',
                'A quiet space — silence your phone',
              ].map((s, i) => (
                <Text key={i} style={styles.sandhyaCheck}>✓  {s}</Text>
              ))}

              <Text style={styles.sandhyaSection}>WHY THESE TIMES?</Text>
              <Text style={styles.sandhyaWhat}>
                The three sandhi-kalas are joints between night and day,
                light and shadow. Scripturally, the Sun's tejas is most
                accessible here. Physiologically, the autonomic switch
                between sympathetic and parasympathetic mirrors these
                same moments — perfect time for breath + mantra to land.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit item sheet */}
      {editingId && (
        <EditItemSheet
          item={items.find(i => i.id === editingId)!}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); refresh(); }}
        />
      )}
    </View>
  );
};

// ─── Add Item Sheet ──────────────────────────────────────────────

const AddItemSheet: React.FC<{
  category: RoutineCategory;
  onClose: () => void;
  onAdded: () => void;
}> = ({ category, onClose, onAdded }) => {
  const meta = CATEGORY_META[category];
  // Exercise stays simple — no Sadhana Path option. For body activities
  // the picker stays a single-item list (Walk · Run · Gym etc.) without
  // confusing custom-path complexity.
  const catalog = React.useMemo(
    () => category === 'exercise'
      ? CATALOG_FOR[category]()
      : [OTHER_ENTRY, ...CATALOG_FOR[category]()],
    [category]
  );
  const stepUnit = STEP_UNIT_FOR[category];
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('15');
  const [time, setTime] = useState<string | null>(null);
  const [freqMode, setFreqMode] = useState<'daily' | 'days'>('daily');
  const [days, setDays] = useState<number[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);

  // ── Reminder toggle ──
  const [reminderEnabled, setReminderEnabled] = useState(false);

  // ── Custom multi-step path editor ──
  const [steps, setSteps] = useState<Array<{ name: string; value: number }>>([]);
  const [newStepName, setNewStepName] = useState('');
  const [newStepValue, setNewStepValue] = useState(stepUnit === 'malas' ? '1' : '5');
  const [showDeityPicker, setShowDeityPicker] = useState(false);
  const isCustomPath = pickedId === OTHER_ENTRY.id;

  const addStep = () => {
    const n = newStepName.trim(); const v = parseFloat(newStepValue);
    if (!n || !v || v <= 0) return;
    setSteps(s => [...s, { name: n, value: v }]);
    setNewStepName('');
    setNewStepValue(stepUnit === 'malas' ? '1' : '5');
  };
  const removeStep = (idx: number) => setSteps(s => s.filter((_, i) => i !== idx));
  const stepsTotal = React.useMemo(() => steps.reduce((s, x) => s + x.value, 0), [steps]);

  const save = async () => {
    const finalName = name.trim();
    if (!finalName) return;
    // For custom path with steps, derive total duration in min
    const dur = isCustomPath && steps.length > 0
      ? (stepUnit === 'min' ? stepsTotal : Math.max(stepsTotal * 5, 5))  // 5 min/mala rough estimate
      : (parseInt(duration, 10) || 15);
    const freq = freqMode === 'daily' ? 'daily' : (days.length > 0 ? days : 'daily');

    // Build prepList for festival items if a known festival was picked
    const prepList = (category === 'festival' && pickedId && FESTIVAL_PREP[pickedId])
      ? FESTIVAL_PREP[pickedId].map(item => ({ item, done: false }))
      : undefined;

    const added = await routineRepo.add({
      category,
      name: finalName,
      durationMin: dur,
      time,
      frequency: freq,
      custom: !pickedId || isCustomPath,
      prepList,
      steps: isCustomPath && steps.length > 0
        ? steps.map(s => ({ name: s.name, value: s.value, unit: stepUnit, done: false }))
        : undefined,
    });

    // Schedule reminder if toggle is ON + time is set
    if (reminderEnabled && time) {
      const granted = await requestNotificationPermission();
      if (granted) {
        const ids = await scheduleRoutineReminder({
          title: `🎯 ${finalName}`,
          body: `Your committed ${dur}-min practice`,
          time,
          frequency: freq,
          routineId: added.id,
        });
        await routineRepo.update(added.id, { notificationIds: ids });
      }
    }
    onAdded();
  };

  const pickFromCatalog = (entry: CatalogEntry) => {
    setPickedId(entry.id);
    setName(entry.name);
    setDuration(String(entry.defaultMin));
  };

  const toggleDay = (d: number) =>
    setDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort());

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{meta.icon}  Add {meta.label} item</Text>

          <Text style={styles.sheetFieldLabel}>
            Pick from {meta.label} library ({catalog.length})
          </Text>
          <ScrollView style={styles.catalogScroll} showsVerticalScrollIndicator={false}>
            {catalog.map(entry => (
              <TouchableOpacity
                key={entry.id}
                style={[styles.catalogRow, pickedId === entry.id && styles.catalogRowActive]}
                onPress={() => pickFromCatalog(entry)}
              >
                <Text style={styles.catalogIcon}>{entry.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.catalogName}>{entry.name}</Text>
                  {!!entry.sub && (
                    <Text style={styles.catalogSub} numberOfLines={1}>{entry.sub}</Text>
                  )}
                </View>
                <Text style={styles.catalogMin}>{entry.defaultMin} min</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {isCustomPath ? (
            // Custom Sadhana Path — explicit "name your path (optional)"
            // text box so the user knows this is for the label they will
            // see in the catalog. Small, light-weight, optional.
            <View style={styles.pathNameBox}>
              <Text style={styles.pathNameLabel}>
                🪷  NAME YOUR SADHANA PATH (OPTIONAL)
              </Text>
              <TextInput
                style={styles.sheetInput}
                value={name}
                onChangeText={setName}
                placeholder={
                  category === 'japa'   ? 'e.g. "Morning Trinity Japa"' :
                  category === 'yoga'   ? 'e.g. "Sunrise Asana Flow"' :
                  category === 'meditate' ? 'e.g. "Pre-bed Box Breath"' :
                  `e.g. "My ${meta.label.toLowerCase()} flow"`
                }
                placeholderTextColor={COLORS.muted}
              />
              <Text style={styles.pathNameHint}>
                We'll use this name in your routine list and reminders. Leave blank to auto-name.
              </Text>
            </View>
          ) : (
            // Library item picked — name shown for confirmation / edit
            <View>
              <Text style={styles.sheetFieldLabel}>Or type your own name</Text>
              <TextInput
                style={styles.sheetInput}
                value={name}
                onChangeText={t => { setName(t); if (pickedId) setPickedId(null); }}
                placeholder={`Custom ${meta.label.toLowerCase()} name`}
                placeholderTextColor={COLORS.muted}
              />
            </View>
          )}

          {/* Custom-path step editor — only when "Other" is picked.
              Redesigned (v40): each step lives inside its OWN bordered
              card so the sequence is visually clear. The "Add step N+1"
              section is a separate bordered sub-card containing the
              picker dropdown stacked directly above the name/value
              input row — picker + input share the same column so the
              UI flows naturally top → bottom. */}
          {isCustomPath && (
            <View style={styles.stepEditor}>
              <Text style={styles.stepEditorLabel}>
                {steps.length === 0
                  ? `BUILD YOUR ${meta.label.toUpperCase()} PATH`
                  : `STEPS (${steps.length}) · TOTAL ${stepsTotal} ${stepUnit.toUpperCase()}`}
              </Text>
              {steps.length === 0 && (
                <Text style={styles.stepEmpty}>
                  {category === 'japa'
                    ? 'Add deities one by one — e.g. "Ganapathi 1 mala", "Guru 1 mala", "Ishta Devi 5 malas".'
                    : 'Add poses or moves one by one — sequence them in the order you practice.'}
                </Text>
              )}

              {/* Existing steps — each in its own bordered card */}
              {steps.map((s, idx) => (
                <View key={idx} style={styles.stepCard}>
                  <View style={styles.stepCardBadge}>
                    <Text style={styles.stepCardBadgeText}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepCardName} numberOfLines={2}>{s.name}</Text>
                    <Text style={styles.stepCardValue}>{s.value} {stepUnit}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeStep(idx)} hitSlop={{top:8,right:8,bottom:8,left:8}}>
                    <Text style={styles.stepRemove}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {/* "Add step N" section — picker on top, input below.
                  Sits in its own bordered card so it's clearly the
                  workbench for the NEXT step. */}
              <View style={styles.addStepCard}>
                <Text style={styles.addStepLabel}>
                  + ADD STEP {steps.length + 1}
                </Text>

                {/* Picker dropdown — full-width, aligned with step inputs below */}
                <TouchableOpacity
                  style={styles.pickerBtn}
                  onPress={() => setShowDeityPicker(v => !v)}
                >
                  <Text style={styles.pickerBtnText}>
                    🪷  {STEP_PICKER_LABEL[category]}
                  </Text>
                  <Text style={styles.pickerBtnChevron}>
                    {showDeityPicker ? '▴' : '▾'}
                  </Text>
                </TouchableOpacity>

                {showDeityPicker && (
                  <ScrollView
                    style={styles.deityPickerScroll}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                  >
                    {STEP_OPTIONS_FOR[category]().map(opt => (
                      <TouchableOpacity
                        key={opt.id}
                        style={styles.deityPickerRow}
                        onPress={() => {
                          setNewStepName(opt.name);
                          if (stepUnit === 'min' && opt.defaultMin)
                            setNewStepValue(String(opt.defaultMin));
                          setShowDeityPicker(false);
                        }}
                      >
                        <Text style={styles.deityPickerIcon}>{opt.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.deityPickerName}>{opt.name}</Text>
                          {!!opt.sub && (
                            <Text style={styles.deityPickerMantra} numberOfLines={1}>{opt.sub}</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.deityPickerRow, { borderBottomWidth: 0 }]}
                      onPress={() => {
                        setNewStepName('');
                        setShowDeityPicker(false);
                      }}
                    >
                      <Text style={styles.deityPickerIcon}>✍️</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.deityPickerName, { color: COLORS.gold }]}>
                          Other / Custom
                        </Text>
                        <Text style={styles.deityPickerMantra}>
                          Type your own {category === 'japa' ? 'deity or mantra' : 'name'} below
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </ScrollView>
                )}

                {/* Name + value inputs — aligned beneath the picker */}
                <View style={styles.stepInputRow}>
                  <TextInput
                    style={[styles.sheetInput, { flex: 2 }]}
                    value={newStepName}
                    onChangeText={setNewStepName}
                    placeholder={
                      category === 'japa' ? 'Deity / mantra' :
                      category === 'yoga' ? 'Asana / pranayama' :
                      category === 'meditate' ? 'Technique' :
                      'Step name'
                    }
                    placeholderTextColor={COLORS.muted}
                  />
                  <TextInput
                    style={[styles.sheetInput, { flex: 0.8 }]}
                    value={newStepValue}
                    onChangeText={setNewStepValue}
                    placeholder={stepUnit === 'malas' ? '1' : '5'}
                    placeholderTextColor={COLORS.muted}
                    keyboardType="number-pad"
                  />
                  <TouchableOpacity style={styles.stepAddBtn} onPress={addStep}>
                    <Text style={styles.stepAddBtnText}>＋</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.stepHint}>
                  {stepUnit === 'malas'
                    ? '1 mala = 108 japas · pick from list or type your own'
                    : 'minutes per step · pick from list or type your own'}
                </Text>
              </View>
            </View>
          )}

          {/* Duration (hidden in custom-path mode — derived from steps) */}
          {!isCustomPath && (
            <View>
              <Text style={styles.sheetFieldLabel}>Minutes</Text>
              <TextInput
                style={styles.sheetInput}
                value={duration}
                onChangeText={setDuration}
                placeholder="15"
                placeholderTextColor={COLORS.muted}
                keyboardType="number-pad"
              />
            </View>
          )}

          {/* Reminder toggle + clock picker */}
          <ReminderBlock
            enabled={reminderEnabled}
            onEnabledChange={setReminderEnabled}
            time={time}
            onTimeChange={setTime}
          />

          <Text style={styles.sheetFieldLabel}>Frequency</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: SPACING.sm }}>
            <TouchableOpacity
              style={[styles.freqChip, freqMode === 'daily' && styles.freqChipActive]}
              onPress={() => setFreqMode('daily')}
            >
              <Text style={[styles.freqText, freqMode === 'daily' && styles.freqTextActive]}>Daily</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.freqChip, freqMode === 'days' && styles.freqChipActive]}
              onPress={() => setFreqMode('days')}
            >
              <Text style={[styles.freqText, freqMode === 'days' && styles.freqTextActive]}>Specific days</Text>
            </TouchableOpacity>
          </View>
          {freqMode === 'days' && (
            <View style={styles.dayRow}>
              {['S','M','T','W','T','F','S'].map((d, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.dayChip, days.includes(i) && styles.dayChipActive]}
                  onPress={() => toggleDay(i)}
                >
                  <Text style={[styles.dayText, days.includes(i) && styles.dayTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={save}>
              <Text style={styles.saveText}>Add to routine</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Edit Item Sheet ────────────────────────────────────────────

const EditItemSheet: React.FC<{
  item: RoutineItem;
  onClose: () => void;
  onSaved: () => void;
}> = ({ item, onClose, onSaved }) => {
  const [name, setName] = useState(item.name);
  const [duration, setDuration] = useState(String(item.durationMin));
  const [time, setTime] = useState<string | null>(item.time ?? null);
  const [reminderEnabled, setReminderEnabled] = useState(!!item.notificationIds);

  const save = async () => {
    const newTime = reminderEnabled ? time : null;
    // Cancel any existing reminder; reschedule if still enabled
    if (item.notificationIds) {
      await cancelRoutineReminder(item.notificationIds);
    }
    let newIds: Record<number, string> | undefined;
    if (reminderEnabled && newTime) {
      const granted = await requestNotificationPermission();
      if (granted) {
        newIds = await scheduleRoutineReminder({
          title: `🎯 ${name.trim() || item.name}`,
          body: `Your committed ${parseInt(duration, 10) || item.durationMin}-min practice`,
          time: newTime,
          frequency: item.frequency,
          routineId: item.id,
        });
      }
    }
    await routineRepo.update(item.id, {
      name: name.trim() || item.name,
      durationMin: parseInt(duration, 10) || item.durationMin,
      time: newTime,
      notificationIds: newIds,
    });
    onSaved();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Edit · {CATEGORY_META[item.category].label}</Text>

          <Text style={styles.sheetFieldLabel}>Name</Text>
          <TextInput
            style={styles.sheetInput}
            value={name}
            onChangeText={setName}
            placeholderTextColor={COLORS.muted}
          />

          <Text style={styles.sheetFieldLabel}>Minutes</Text>
          <TextInput
            style={styles.sheetInput}
            value={duration}
            onChangeText={setDuration}
            keyboardType="number-pad"
          />

          {/* Reminder toggle + cross-platform clock picker */}
          <ReminderBlock
            enabled={reminderEnabled}
            onEnabledChange={setReminderEnabled}
            time={time}
            onTimeChange={setTime}
          />

          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={save}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── AI Plan bucket row — one of the 5 buckets (walk/yoga/japa/...) ─

const PlanBucketRow: React.FC<{ icon: string; label: string; mins: number }> = ({ icon, label, mins }) => {
  // Width % is mapped from minutes (cap at 30 min = 100% width) so the
  // bar visually telegraphs which bucket is largest today.
  const pct = Math.min(100, Math.round((mins / 30) * 100));
  return (
    <View style={styles.bucketRow}>
      <Text style={styles.bucketIcon}>{icon}</Text>
      <Text style={styles.bucketLabel}>{label}</Text>
      <View style={styles.bucketBarTrack}>
        <View style={[styles.bucketBarFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.bucketMins}>{mins} min</Text>
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  content: { paddingVertical: SPACING.lg, paddingBottom: 80 },
  header: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  title: { fontSize: 22, color: COLORS.cream, fontWeight: '700' },
  subtitle: { fontSize: 12, color: COLORS.muted, marginTop: 4 },

  // Plan close × button (returns to Home)
  planCloseBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.cardBg, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  planCloseText: { color: COLORS.muted, fontSize: 18, fontWeight: '700' },

  chatCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, backgroundColor: COLORS.cardBg, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(212,160,23,0.25)',
  },
  chatLabel: { fontSize: 10, color: COLORS.gold, fontWeight: '800', letterSpacing: 1.5 },
  chatHint: { fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginTop: 4, marginBottom: SPACING.sm },
  chatRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm },
  chatInput: {
    flex: 1, backgroundColor: COLORS.deep, borderRadius: 10,
    padding: SPACING.sm, color: COLORS.cream, fontSize: 14,
    borderWidth: 1, borderColor: COLORS.border, minHeight: 50, maxHeight: 90,
  },
  chatSendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  chatSendText: { color: COLORS.deep, fontSize: 22, fontWeight: '800' },

  previewBox: {
    marginTop: SPACING.md, padding: SPACING.sm,
    backgroundColor: 'rgba(78,168,222,0.10)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(78,168,222,0.3)',
  },
  previewLabel: { fontSize: 12, color: '#4ea8de', fontWeight: '700', marginBottom: 6 },
  previewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  previewIcon: { fontSize: 18, marginRight: 8 },
  previewText: { fontSize: 12, color: COLORS.cream, flex: 1 },
  previewCancel: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  previewCancelText: { color: COLORS.muted, fontWeight: '600', fontSize: 12 },
  previewConfirm: {
    flex: 2, paddingVertical: 8, borderRadius: 8,
    backgroundColor: COLORS.gold, alignItems: 'center',
  },
  previewConfirmText: { color: COLORS.deep, fontWeight: '700', fontSize: 13 },

  sectionLabel: {
    fontSize: 11, color: COLORS.muted, fontWeight: '700', letterSpacing: 1.5,
    marginHorizontal: SPACING.md, marginTop: SPACING.lg, marginBottom: SPACING.sm,
  },

  emptyCard: {
    marginHorizontal: SPACING.md, padding: SPACING.lg,
    backgroundColor: COLORS.cardBg, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  emptyText: { color: COLORS.muted, fontSize: 12, fontStyle: 'italic', textAlign: 'center' },

  todaySectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginHorizontal: SPACING.md, marginTop: SPACING.lg, marginBottom: SPACING.sm,
  },
  sectionLabelInline: {
    fontSize: 11, color: COLORS.muted, fontWeight: '700', letterSpacing: 1.5,
  },
  todayHeaderMeta: { fontSize: 11, color: COLORS.gold, fontWeight: '600' },

  // Next-up hero card
  nextUpCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    backgroundColor: 'rgba(212,160,23,0.10)',
    borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.gold,
    padding: SPACING.md,
  },
  nextUpBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.gold, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: SPACING.sm,
  },
  nextUpBadgeText: { color: COLORS.deep, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  nextUpRow: { flexDirection: 'row', alignItems: 'flex-start' },
  nextUpTime: {
    width: 64, fontSize: 18, color: COLORS.gold, fontWeight: '800',
    marginTop: 2,
  },
  nextUpIcon: { fontSize: 26, width: 36, textAlign: 'center', marginTop: 1 },
  nextUpName: { color: COLORS.cream, fontSize: 16, fontWeight: '700' },
  nextUpSub: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  nextUpSteps: {
    marginTop: 8, paddingLeft: 8,
    borderLeftWidth: 2, borderLeftColor: 'rgba(212,160,23,0.4)',
  },
  nextUpStepLine: { fontSize: 11, color: COLORS.cream, paddingVertical: 1 },

  todayCard: {
    marginHorizontal: SPACING.md, backgroundColor: COLORS.cardBg,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  todayRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  todayTime: { width: 54, fontSize: 13, color: COLORS.gold, fontWeight: '700' },
  todayIcon: { fontSize: 18, width: 28 },
  todayName: { color: COLORS.cream, fontSize: 13, fontWeight: '600' },
  todaySub:  { color: COLORS.muted, fontSize: 11, marginTop: 1 },
  todayDelete: { color: COLORS.muted, fontSize: 16, paddingHorizontal: 6 },

  itemBell: { color: COLORS.gold, fontSize: 11 },
  prepBox: {
    marginTop: 4, marginLeft: 8, marginBottom: 8,
    paddingLeft: 12,
    borderLeftWidth: 2, borderLeftColor: 'rgba(212,160,23,0.35)',
  },
  prepLabel: {
    fontSize: 10, color: COLORS.gold, fontWeight: '800',
    letterSpacing: 1.2, marginBottom: 4,
  },
  prepRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 3,
  },
  prepCheck: { fontSize: 14, color: COLORS.gold, marginRight: 8, width: 18 },
  prepItem: { fontSize: 12, color: COLORS.cream, flex: 1 },
  prepItemDone: { textDecorationLine: 'line-through', color: COLORS.muted },

  catCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    backgroundColor: COLORS.cardBg, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  catHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md,
  },
  catIcon: { fontSize: 24, marginRight: SPACING.sm, width: 32 },
  catLabel: { fontSize: 14, color: COLORS.cream, fontWeight: '700' },
  catSummary: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  catChevron: { fontSize: 22, color: COLORS.gold, fontWeight: '300', paddingHorizontal: 8 },

  catExpanded: {
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.md,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  itemName: { color: COLORS.cream, fontSize: 13, fontWeight: '600' },
  itemMeta: { color: COLORS.muted, fontSize: 11, marginTop: 1 },
  itemAction: { color: COLORS.gold, fontSize: 12, fontWeight: '600', paddingHorizontal: 8 },

  addBtn: {
    marginTop: SPACING.sm, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.gold,
    alignItems: 'center', backgroundColor: 'rgba(212,160,23,0.06)',
  },
  addBtnText: { color: COLORS.gold, fontSize: 12, fontWeight: '700' },

  recCard: {
    marginHorizontal: SPACING.md, padding: SPACING.md,
    backgroundColor: 'rgba(212,160,23,0.10)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(212,160,23,0.3)',
  },
  recText: { fontSize: 13, color: COLORS.cream, lineHeight: 19 },
  recBold: { color: COLORS.gold, fontWeight: '700' },

  // ── AI Personalized Plan card (vitals + age + 7-day history) ──
  aiPlanCard: {
    marginHorizontal: SPACING.md, marginTop: SPACING.md, padding: SPACING.md,
    backgroundColor: 'rgba(80, 200, 180, 0.08)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(80, 200, 180, 0.35)',
  },
  aiPlanHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
  },
  aiPlanTitle: { fontSize: 13, color: '#7FE8C8', fontWeight: '800', letterSpacing: 0.4 },
  aiPlanTotal: { fontSize: 18, color: '#7FE8C8', fontWeight: '700' },
  aiPlanSub: { fontSize: 11, color: COLORS.muted, marginTop: 2, marginBottom: SPACING.sm },
  aiPlanNote: {
    fontSize: 13, color: COLORS.cream, fontStyle: 'italic',
    lineHeight: 18, marginBottom: 4,
  },
  aiPlanBuckets: { marginTop: SPACING.sm, gap: 6 },
  bucketRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bucketIcon: { fontSize: 16, width: 22 },
  bucketLabel: { fontSize: 12, color: COLORS.cream, fontWeight: '600', width: 84 },
  bucketBarTrack: {
    flex: 1, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden',
  },
  bucketBarFill: { height: '100%', backgroundColor: '#7FE8C8', borderRadius: 4 },
  bucketMins: { fontSize: 12, color: COLORS.cream, fontWeight: '700', width: 56, textAlign: 'right' },

  aiPlanWhyBtn: { marginTop: SPACING.sm, alignSelf: 'flex-start' },
  aiPlanWhyText: { fontSize: 11, color: '#7FE8C8', fontWeight: '700' },
  aiPlanRationaleBox: {
    marginTop: 6, padding: SPACING.sm, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  aiPlanRationaleLine: { fontSize: 11, color: COLORS.cream, lineHeight: 16, marginBottom: 2 },
  aiPlanProvenance: { fontSize: 10, color: COLORS.muted, marginTop: 6, fontStyle: 'italic' },

  // Hint shown inside the Shraadha category card before FamilyMembersCard
  shraadhaHint: {
    fontSize: 12, color: COLORS.muted, fontStyle: 'italic',
    lineHeight: 17, paddingHorizontal: SPACING.md,
    marginTop: SPACING.sm, marginBottom: SPACING.sm,
  },

  // Add / Edit sheets
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.darkBg,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: SPACING.md, paddingBottom: SPACING.xl, maxHeight: '88%',
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  sheetTitle: { fontSize: 18, color: COLORS.cream, fontWeight: '700', marginBottom: SPACING.md },
  sheetFieldLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '700', letterSpacing: 1, marginTop: 8, marginBottom: 4 },
  sheetInput: {
    backgroundColor: COLORS.cardBg, borderRadius: 10, padding: SPACING.sm,
    color: COLORS.cream, fontSize: 14, borderWidth: 1, borderColor: COLORS.border,
    minHeight: 42, justifyContent: 'center',
  },
  // Sandhya info modal
  sandhyaIntro: { fontSize: 13, color: COLORS.cream, lineHeight: 19, marginBottom: SPACING.md },
  sandhyaInfoBox: {
    marginBottom: SPACING.sm, padding: SPACING.sm,
    backgroundColor: COLORS.deep, borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: COLORS.gold,
  },
  sandhyaName: { color: COLORS.cream, fontSize: 14, fontWeight: '800' },
  sandhyaWhen: { color: COLORS.gold, fontSize: 11, fontWeight: '700', marginTop: 2 },
  sandhyaWhat: { color: COLORS.cream, fontSize: 12, lineHeight: 17, marginTop: 4 },
  sandhyaSection: {
    fontSize: 10, color: COLORS.muted, fontWeight: '800',
    letterSpacing: 1.2, marginTop: SPACING.md, marginBottom: 6,
  },
  sandhyaCheck: { color: COLORS.cream, fontSize: 12, lineHeight: 19, paddingLeft: 6 },

  // Reminder block (toggle + time picker)
  reminderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6, marginTop: 8,
  },
  reminderHint: { fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginTop: 2 },

  // ── "Name your Sadhana Path" box (custom path mode) ──
  pathNameBox: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: 10,
    backgroundColor: 'rgba(212,160,23,0.06)',
    borderWidth: 1, borderColor: 'rgba(212,160,23,0.25)',
  },
  pathNameLabel: {
    fontSize: 11, color: COLORS.gold, fontWeight: '800',
    letterSpacing: 1, marginBottom: 6,
  },
  pathNameHint: {
    fontSize: 10, color: COLORS.muted, fontStyle: 'italic',
    marginTop: 6, lineHeight: 14,
  },

  // Custom-path step editor
  stepEditor: {
    marginTop: SPACING.sm, padding: SPACING.sm,
    backgroundColor: 'rgba(212,160,23,0.07)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(212,160,23,0.30)',
  },
  stepEditorLabel: {
    fontSize: 10, color: COLORS.gold, fontWeight: '800',
    letterSpacing: 1.2, marginBottom: 6,
  },
  stepEmpty: { fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginBottom: 8 },

  // ── Each existing step in its own bordered card (v40 redesign) ──
  stepCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 10,
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(212,160,23,0.30)',
    marginBottom: 8,
  },
  stepCardBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center',
  },
  stepCardBadgeText: { color: COLORS.deep, fontSize: 12, fontWeight: '800' },
  stepCardName:  { color: COLORS.cream, fontSize: 13, fontWeight: '600' },
  stepCardValue: { color: COLORS.gold, fontSize: 11, fontWeight: '700', marginTop: 2 },
  stepRemove: { color: COLORS.error, fontSize: 16, paddingHorizontal: 6 },

  // ── "Add step N" sub-card — picker on top, input row below ──
  addStepCard: {
    marginTop: 4, padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    borderWidth: 1, borderStyle: 'dashed',
    borderColor: 'rgba(212,160,23,0.45)',
  },
  addStepLabel: {
    fontSize: 10, color: COLORS.gold, fontWeight: '800',
    letterSpacing: 1.2, marginBottom: 8,
  },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: COLORS.deep, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.gold,
    marginBottom: 8,
  },
  pickerBtnText: { color: COLORS.gold, fontSize: 13, fontWeight: '700', flex: 1 },
  pickerBtnChevron: { color: COLORS.gold, fontSize: 12, fontWeight: '700' },
  stepInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  stepAddBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center',
  },
  stepAddBtnText: { color: COLORS.deep, fontSize: 20, fontWeight: '800' },
  stepHint: { fontSize: 10, color: COLORS.muted, fontStyle: 'italic', marginTop: 6 },

  // Deity dropdown (Japa step editor only)
  deityDropdownBtn: {
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: COLORS.cardBg, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.gold,
    marginBottom: 6,
  },
  deityDropdownText: { color: COLORS.gold, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  deityPickerScroll: {
    maxHeight: 220,
    backgroundColor: COLORS.deep, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm, marginBottom: 6,
  },
  deityPickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  deityPickerIcon: { fontSize: 22, marginRight: 10, width: 28, textAlign: 'center' },
  deityPickerName: { fontSize: 13, color: COLORS.cream, fontWeight: '600' },
  deityPickerMantra: { fontSize: 10, color: COLORS.muted, fontStyle: 'italic', marginTop: 1 },

  // Library catalog list inside the Add sheet
  catalogScroll: {
    maxHeight: 240,
    backgroundColor: COLORS.deep,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm, marginBottom: 4,
  },
  catalogRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  catalogRowActive: { backgroundColor: 'rgba(212,160,23,0.12)' },
  catalogIcon: { fontSize: 22, marginRight: 10, width: 30, textAlign: 'center' },
  catalogName: { fontSize: 13, color: COLORS.cream, fontWeight: '600' },
  catalogSub: { fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginTop: 1 },
  catalogMin: { fontSize: 11, color: COLORS.gold, fontWeight: '700', marginLeft: 6 },
  freqChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardBg,
  },
  freqChipActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  freqText: { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
  freqTextActive: { color: COLORS.gold },
  dayRow: { flexDirection: 'row', gap: 4, marginBottom: SPACING.sm },
  dayChip: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardBg,
  },
  dayChipActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  dayText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  dayTextActive: { color: COLORS.gold },
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
