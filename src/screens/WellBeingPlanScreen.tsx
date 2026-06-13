/**
 * WellBeingPlanScreen — v60 redesign of the Plan tab.
 *
 * Why a redesign:
 *   The old SankalpaScreen packed AI Insights + chat parser + 5 expandable
 *   category cards + Today's routine + AddItemSheet onto one dense scroll.
 *   Elderly users couldn't find the reminder flow, didn't understand the
 *   tone tiles, and missed the voice option entirely.
 *
 * New structure:
 *   • Top: warm header + AI suggestion strip (1 line, optional)
 *   • Middle: "Your reminders" — one BIG card per routine item.  Each
 *     card shows category icon · name · time · tone · voice status with
 *     14 pt+ text.  Tap to edit, ✕ to delete.
 *   • Bottom: single huge gold "+ Add a new reminder" button.
 *
 * Add a new reminder = 4-step wizard MODAL:
 *   1. "What do you want to do?"    — 5 big category tiles
 *   2. "Pick from the list"          — searchable catalog + custom name
 *   3. "When and how often?"         — TimePickerField + frequency tiles
 *   4. "How should I remind you?"    — reminder toggle + tone tiles
 *                                       (incl. + Custom from device)
 *                                       + separate Speak-my-name toggle
 *   Big NEXT / BACK pills at the bottom of each step.  Step 4 ends in
 *   ✓ SAVE.  All persistence uses the existing routineRepo so we don't
 *   lose data from the previous screen.
 *
 * Same data model — RoutineItem, alarmSoundId, alarmCustomUri,
 * alarmCustomName, spokenReminder.  Existing routine items render
 * cleanly in the new card list.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Switch,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ExpoSpeech from 'expo-speech';
import { useAudioPlayer } from 'expo-audio';
import { COLORS, SPACING } from '../theme';
import { useSadhana } from '../context';
import { routineRepo, RoutineItem, RoutineCategory } from '../services/routineRepo';
import { TimePickerField } from '../components/TimePickerField';
import { YOGA_CATALOG } from './YogaScreen';
import { EXERCISE_CATALOG } from './ExerciseScreen';
import { MEDITATION_CATALOG } from './MeditationScreen';
import { ALL_CATALOG_DEITIES } from '../deityCatalog';
import {
  scheduleRoutineReminder, cancelRoutineReminder, requestNotificationPermission,
} from '../services/notifications';
import { vitalsPlanEngine, VitalsPlan } from '../soulsync/ai/VitalsPlanEngine';
// v67: Sacred Days & Occasions — festivals, tithi, special days, pitru shraadha
import { specialSadhanaRepo, SpecialSadhana } from '../services/specialSadhanaRepo';
import { FamilyMembersCard } from '../components/FamilyMembersCard';
import { getUpcomingFestivals, formatShortDate } from '../utils';

// ─── Catalog meta ───────────────────────────────────────────────

const CATEGORIES: Array<{
  id: RoutineCategory; label: string; icon: string; color: string;
  hint: string; defaultMin: number;
}> = [
  { id: 'exercise', label: 'Exercise',  icon: '🏃',   color: '#4ea8de', hint: 'Walk · jog · cycle · gym', defaultMin: 30 },
  { id: 'yoga',     label: 'Yoga',      icon: '🧘‍♀️', color: '#FFB800', hint: 'Asanas · pranayama',       defaultMin: 20 },
  { id: 'japa',     label: 'Japa',      icon: '📿',   color: '#FF8C42', hint: 'Mantra · mala',            defaultMin: 15 },
  { id: 'sandhya',  label: 'Sandhya',   icon: '🌅',   color: '#FFD9A8', hint: 'Pratah · sayam',           defaultMin: 10 },
  { id: 'meditate', label: 'Meditate',  icon: '🪷',   color: '#c084fc', hint: 'Breath · stillness',       defaultMin: 15 },
];

const CAT_META: Record<RoutineCategory, { label: string; icon: string; color: string }> = {
  exercise: { label: 'Exercise', icon: '🏃',  color: '#4ea8de' },
  yoga:     { label: 'Yoga',     icon: '🧘‍♀️', color: '#FFB800' },
  japa:     { label: 'Japa',     icon: '📿',  color: '#FF8C42' },
  sandhya:  { label: 'Sandhya',  icon: '🌅',  color: '#FFD9A8' },
  meditate: { label: 'Meditate', icon: '🪷',  color: '#c084fc' },
  shraadha: { label: 'Shraadha', icon: '🕯️',  color: '#a78bfa' },
  tithi:    { label: 'Tithi',    icon: '🌗',  color: '#94a3b8' },
  festival: { label: 'Festival', icon: '🛕',  color: '#f472b6' },
};

interface PickEntry { id: string; name: string; icon: string; sub?: string; defaultMin: number; }

const POPULAR_DEITIES = ['Ganesha','Shiva','Krishna','Lakshmi','Hanuman','Rama','Devi','Durga','Saraswati'];
const popRank = (name: string) => {
  for (let i = 0; i < POPULAR_DEITIES.length; i++) {
    if (name.toLowerCase().includes(POPULAR_DEITIES[i].toLowerCase())) return i;
  }
  return 999;
};

// v61: synthetic "Design your own" tile sits at the TOP of every
// catalog (yoga/japa/meditate/sandhya/exercise) so users can craft a
// custom Sadhana / routine instead of being limited to presets.
const DESIGN_YOUR_OWN: Record<string, PickEntry> = {
  exercise: { id: '__design__', name: 'Design your own workout', icon: '✨', sub: 'Type a custom name + duration below',  defaultMin: 30 },
  yoga:     { id: '__design__', name: 'Design your own Sadhana',  icon: '✨', sub: 'Custom yoga + pranayama flow',          defaultMin: 20 },
  japa:     { id: '__design__', name: 'Design your own Sadhana',  icon: '✨', sub: 'Custom japa for your ishta devata',     defaultMin: 15 },
  meditate: { id: '__design__', name: 'Design your own Sadhana',  icon: '✨', sub: 'Custom meditation / muraqaba flow',     defaultMin: 15 },
  sandhya:  { id: '__design__', name: 'Design your own ritual',   icon: '✨', sub: 'Custom sandhya / twilight ritual',      defaultMin: 10 },
};

const catalogFor = (cat: RoutineCategory): PickEntry[] => {
  const design = DESIGN_YOUR_OWN[cat];
  let entries: PickEntry[] = [];
  if (cat === 'exercise') entries = EXERCISE_CATALOG.map((e: any) => ({
    id: e.id, name: e.name, icon: e.icon || '🏃', sub: e.subtitle || '',
    defaultMin: Math.max(5, Math.round((e.durationSec || 1800) / 60)),
  }));
  else if (cat === 'yoga') entries = YOGA_CATALOG.map((y: any) => ({
    id: y.id, name: y.name, icon: '🧘', sub: y.sanskrit || '',
    defaultMin: Math.max(5, Math.round((y.durationSec || 600) / 60)),
  }));
  else if (cat === 'meditate') entries = MEDITATION_CATALOG.map((m: any) => ({
    id: m.id, name: m.name, icon: '🪷', sub: m.subtitle || '',
    defaultMin: Math.max(5, Math.round((m.durationSec || 600) / 60)),
  }));
  else if (cat === 'japa') entries = ALL_CATALOG_DEITIES
    .map((d: any) => ({ id: d.id, name: d.name, icon: d.icon || '🪷', sub: d.mantra || '', defaultMin: 15 }))
    .sort((a, b) => popRank(a.name) - popRank(b.name));
  else if (cat === 'sandhya') entries = [
    { id: 'pratah',      name: 'Pratah Sandhya',      icon: '🌅', sub: 'Dawn juncture', defaultMin: 10 },
    { id: 'madhyahnika', name: 'Madhyahnika Sandhya', icon: '🌞', sub: 'Noon juncture', defaultMin: 10 },
    { id: 'sayam',       name: 'Sayam Sandhya',       icon: '🌇', sub: 'Dusk juncture', defaultMin: 10 },
  ];
  return design ? [design, ...entries] : entries;
};

// ─── Tone catalog ────────────────────────────────────────────────

const TONES = [
  { id: 'flute',   icon: '🪈', label: 'Flute',   sub: 'Gentle bansuri',  module: require('../../assets/sounds/flute.mp3') },
  { id: 'bell',    icon: '🔔', label: 'Bell',    sub: 'Temple ghanta',   module: require('../../assets/sounds/bell.mp3') },
  { id: 'tanpura', icon: '🎵', label: 'Tanpura', sub: 'Drone in C',      module: require('../../assets/sounds/tanpura.mp3') },
  { id: 'om',      icon: '🕉',  label: 'Om',      sub: 'Vedic chant',    module: require('../../assets/sounds/om.mp3') },
];

const fmtFrequency = (f: 'daily' | number[]): string => {
  if (f === 'daily') return 'Every day';
  const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return f.map(d => names[d]).join(' · ');
};

const timeUntil = (hhmm?: string | null): { text: string; tomorrow: boolean } => {
  if (!hhmm) return { text: '', tomorrow: false };
  const [h, m] = hhmm.split(':').map(s => parseInt(s, 10) || 0);
  const t = new Date(); t.setHours(h, m, 0, 0);
  let ms = t.getTime() - Date.now();
  let tomorrow = false;
  // v61: if the time already passed today, the next occurrence is tomorrow
  if (ms < -60_000) { ms += 24 * 60 * 60 * 1000; tomorrow = true; }
  if (Math.abs(ms) < 60_000) return { text: 'NOW', tomorrow: false };
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return { text: `${mins} min`, tomorrow };
  const hrs  = Math.floor(mins / 60);
  const rem  = mins % 60;
  return { text: rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`, tomorrow };
};

// ─── Sacred Days & Occasions ─────────────────────────────────────
// v67: occasion reminders distinct from daily routines — they fire on
// calendar / lunar dates, not a daily time. Backed by specialSadhanaRepo
// (tithi + dates triggers) and familyRepo (pitru shraadha).

const TITHI_OPTIONS = [
  { id: 'Ekadashi',  icon: '🌗', sub: 'Every 11th lunar day · fast + japa' },
  { id: 'Pradosh',   icon: '🌘', sub: 'Shiva tithi · evening worship' },
  { id: 'Purnima',   icon: '🌕', sub: 'Full moon · meditation' },
  { id: 'Amavasya',  icon: '🌑', sub: 'New moon · pitru tarpana' },
  { id: 'Sankashti', icon: '🐘', sub: 'Ganesha tithi · 4th after full moon' },
  { id: 'Chaturthi', icon: '🪔', sub: 'Ganesha 4th tithi' },
  { id: 'Ashtami',   icon: '🌓', sub: 'Devi / Krishna 8th tithi' },
];

type OccasionType = 'festival' | 'tithi' | 'special' | 'shraadha';

const OCCASION_TYPES: Array<{ id: OccasionType; icon: string; label: string; hint: string }> = [
  { id: 'festival', icon: '🛕', label: 'Festival',       hint: 'Diwali · Navratri · Ekadashi…' },
  { id: 'tithi',    icon: '🌗', label: 'Tithi day',      hint: 'Recurring lunar observance' },
  { id: 'special',  icon: '🗓', label: 'Special day',    hint: 'Your own date(s)' },
  { id: 'shraadha', icon: '🕯️', label: 'Pitru Shraadha', hint: 'Annual ancestral remembrance' },
];

// A unified card model for rendering both specialSadhanaRepo entries and
// (later) family-shraadha entries in one occasions list.
const describeTrigger = (o: SpecialSadhana): string => {
  if (o.trigger.kind === 'tithi') return `Every ${o.trigger.tithi}`;
  if (o.trigger.kind === 'dates') {
    const ds = o.trigger.dates || [];
    if (ds.length === 0) return 'No date set';
    return ds.length === 1 ? formatShortDate(ds[0]) : `${ds.length} dates`;
  }
  if (o.trigger.kind === 'weekdays') {
    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return o.trigger.days.map(d => names[d]).join(' · ');
  }
  return '';
};

// ─── Main screen ────────────────────────────────────────────────

export const WellBeingPlanScreen = ({ navigation }: any) => {
  const { showToast, userProfile } = useSadhana();
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RoutineItem | null>(null);
  // v61: AI plan card — collapsed by default; expands to show the
  // 5-bucket walking / yoga / japa / meditation / breath breakdown.
  const [aiPlan, setAiPlan] = useState<VitalsPlan | null>(null);
  const [showAi, setShowAi] = useState(false);
  // v67: Sacred Days & Occasions
  const [occasions, setOccasions] = useState<SpecialSadhana[]>([]);
  const [occasionOpen, setOccasionOpen] = useState(false);

  const refresh = async () => {
    setItems(await routineRepo.list());
    setOccasions(await specialSadhanaRepo.list());
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await vitalsPlanEngine.generate(userProfile?.dob);
        if (!cancelled) setAiPlan(p);
      } catch { /* soft-fail */ }
    })();
    return () => { cancelled = true; };
  }, [userProfile?.dob]);

  // Group items by category for visual grouping
  const grouped = React.useMemo(() => {
    const out: Record<string, RoutineItem[]> = {};
    for (const it of items) {
      const k = it.category;
      if (!out[k]) out[k] = [];
      out[k].push(it);
    }
    return out;
  }, [items]);

  const handleDelete = async (id: string) => {
    const it = items.find(x => x.id === id);
    if (it?.notificationIds) await cancelRoutineReminder(it.notificationIds);
    await routineRepo.remove(id);
    showToast('Reminder deleted');
    refresh();
  };

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Plan Your Well-Being</Text>
          <Text style={s.subtitle}>
            Tap any reminder to edit. Tap the gold button below to add a new one.
          </Text>
        </View>

        {/* AI Recommendations — collapsible card */}
        {aiPlan && (
          <View style={s.aiCard}>
            <TouchableOpacity
              style={s.aiHeader}
              onPress={() => setShowAi(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={s.aiTitle}>🌿  AI RECOMMENDATIONS FOR YOU</Text>
              <Text style={s.aiTotal}>{aiPlan.totalMin} min · {showAi ? '▴' : '▾'}</Text>
            </TouchableOpacity>
            {showAi && (
              <View style={{ marginTop: SPACING.sm }}>
                <Text style={s.aiSub}>
                  Tuned to your age, today's vitals, and last 7-day history.
                </Text>
                {aiPlan.notes.map((n, i) => (
                  <Text key={i} style={s.aiNote}>• {n}</Text>
                ))}
                <View style={{ marginTop: SPACING.sm }}>
                  {[
                    { icon: '🚶', label: 'Walking',    mins: aiPlan.walkingMin },
                    { icon: '🧘', label: 'Yoga',       mins: aiPlan.yogaMin },
                    { icon: '📿', label: 'Japa',       mins: aiPlan.japaMin },
                    { icon: '🪷', label: 'Meditation', mins: aiPlan.meditationMin },
                    { icon: '🫁', label: 'Breath work',mins: aiPlan.breathworkMin },
                  ].map(b => {
                    const pct = Math.min(100, Math.round((b.mins / 30) * 100));
                    return (
                      <View key={b.label} style={s.aiBucketRow}>
                        <Text style={s.aiBucketIcon}>{b.icon}</Text>
                        <Text style={s.aiBucketLabel}>{b.label}</Text>
                        <View style={s.aiBucketTrack}>
                          <View style={[s.aiBucketFill, { width: `${pct}%` }]} />
                        </View>
                        <Text style={s.aiBucketMins}>{b.mins} min</Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={s.aiProvenance}>
                  {aiPlan.fromRealVitals  ? '✓ Live ring vitals' : '◌ Dummy fallback'}
                  {'  ·  '}
                  {aiPlan.fromRealHistory ? '✓ 7-day history'    : '◌ No history yet'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── PRIMARY section: Daily Practice Reminders (body & soul) ── */}
        <View style={s.occHeaderRow}>
          <Text style={s.groupLabel}>🔔  DAILY PRACTICE REMINDERS</Text>
        </View>
        <Text style={s.occIntro}>
          Walk · yoga · japa · meditation · sandhya — your everyday body & soul practice.
        </Text>

        {/* Empty state */}
        {items.length === 0 && (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🌱</Text>
            <Text style={s.emptyTitle}>No daily reminders yet</Text>
            <Text style={s.emptySub}>
              Tap the gold button below to add your first one.
              {'\n\n'}
              Start small — a 15-minute walk or one round of japa.
            </Text>
          </View>
        )}

        {/* Reminder cards grouped by category */}
        {CATEGORIES.map(cat => {
          const list = grouped[cat.id];
          if (!list || list.length === 0) return null;
          return (
            <View key={cat.id}>
              <Text style={s.groupLabel}>
                {cat.icon}  {cat.label.toUpperCase()}
              </Text>
              {list.map(it => {
                const next = timeUntil(it.time);
                return (
                  <TouchableOpacity
                    key={it.id}
                    style={s.reminderCard}
                    onPress={() => setEditingItem(it)}
                    activeOpacity={0.7}
                  >
                    <View style={s.reminderCardLeft}>
                      <Text style={s.reminderIcon}>{cat.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.reminderName}>{it.name}</Text>
                      <Text style={s.reminderMeta}>
                        {it.durationMin} min · {fmtFrequency(it.frequency)}
                      </Text>
                      <View style={s.reminderChipsRow}>
                        {it.time && (
                          <View style={s.timeChip}>
                            <Text style={s.timeChipText}>⏰  {it.time}</Text>
                          </View>
                        )}
                        {it.notificationIds && it.alarmSoundId && (
                          <View style={s.toneChip}>
                            <Text style={s.toneChipText}>
                              🎵 {it.alarmCustomName ? it.alarmCustomName.slice(0, 16) :
                                  TONES.find(t => t.id === it.alarmSoundId)?.label || 'Default'}
                            </Text>
                          </View>
                        )}
                        {it.spokenReminder && (
                          <View style={s.voiceChip}>
                            <Text style={s.voiceChipText}>🗣️ Spoken</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {/* v61: prominent "NEXT in 4h" pillar on the right */}
                    <View style={s.reminderCardRight}>
                      {it.time ? (
                        <View style={s.nextPillar}>
                          <Text style={s.nextLabel}>NEXT</Text>
                          <Text style={s.nextValue}>{next.text || '—'}</Text>
                          {next.tomorrow && <Text style={s.nextTomorrow}>tomorrow</Text>}
                        </View>
                      ) : (
                        <Text style={s.editPencil}>✏️</Text>
                      )}
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation?.(); handleDelete(it.id); }}
                        hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                        style={s.deleteBtn}
                      >
                        <Text style={s.deleteBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}

        {/* Inline gold CTA for the daily-practice section */}
        <TouchableOpacity
          style={s.dailyAddBtn}
          onPress={() => setWizardOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={s.dailyAddBtnText}>＋  Add a daily practice reminder</Text>
        </TouchableOpacity>

        {/* ── Sacred Days & Occasions ── */}
        <View style={s.occHeaderRow}>
          <Text style={s.groupLabel}>🗓  SACRED DAYS & OCCASIONS</Text>
        </View>
        <Text style={s.occIntro}>
          Festivals, tithi days, special dates and pitru shraadha — reminders that
          fire on the right calendar day, not every day.
        </Text>

        {occasions.length === 0 && (
          <Text style={s.occEmpty}>None yet. Tap below to add a festival, tithi or special day.</Text>
        )}

        {occasions.map(o => {
          const meta = OCCASION_TYPES.find(t =>
            (o.trigger.kind === 'tithi' && t.id === 'tithi') ||
            (o.trigger.kind === 'dates' && t.id === (o.note === 'festival' ? 'festival' : 'special'))
          );
          return (
            <View key={o.id} style={s.occCard}>
              <Text style={s.occCardIcon}>{meta?.icon || '🗓'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.occCardName}>{o.name}</Text>
                <Text style={s.occCardSub}>
                  {describeTrigger(o)}{o.time ? `  ·  ⏰ ${o.time}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={async () => { await specialSadhanaRepo.remove(o.id); showToast('Occasion removed'); refresh(); }}
                hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                style={s.occDelete}
              >
                <Text style={s.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity style={s.occAddBtn} onPress={() => setOccasionOpen(true)} activeOpacity={0.8}>
          <Text style={s.occAddBtnText}>＋  Add a sacred day / occasion</Text>
        </TouchableOpacity>

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Wizard modal */}
      <WizardModal
        visible={wizardOpen}
        userName={userProfile?.name || ''}
        onClose={() => setWizardOpen(false)}
        onSaved={() => { setWizardOpen(false); showToast('✓ Reminder added'); refresh(); }}
      />

      {/* Edit modal — re-uses the wizard with prefilled state */}
      <WizardModal
        visible={!!editingItem}
        userName={userProfile?.name || ''}
        editing={editingItem}
        onClose={() => setEditingItem(null)}
        onSaved={() => { setEditingItem(null); showToast('✓ Reminder updated'); refresh(); }}
      />

      {/* Sacred Days & Occasions modal */}
      <OccasionModal
        visible={occasionOpen}
        onClose={() => setOccasionOpen(false)}
        onSaved={(msg) => { setOccasionOpen(false); showToast(msg); refresh(); }}
      />
    </View>
  );
};

// ─── Wizard modal ────────────────────────────────────────────────

interface WizardProps {
  visible: boolean;
  userName: string;
  editing?: RoutineItem | null;
  onClose: () => void;
  onSaved: () => void;
}

const WizardModal: React.FC<WizardProps> = ({ visible, userName, editing, onClose, onSaved }) => {
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<RoutineCategory | null>(null);
  const [pickedName, setPickedName] = useState('');
  const [pickedSub, setPickedSub] = useState('');
  const [duration, setDuration] = useState(20);
  const [time, setTime] = useState<string | null>(null);
  const [freqMode, setFreqMode] = useState<'daily' | 'days'>('daily');
  const [days, setDays] = useState<number[]>([]);
  const [reminderOn, setReminderOn] = useState(true);
  const [toneId, setToneId] = useState<string>('flute');
  const [customUri, setCustomUri] = useState<string | undefined>();
  const [customName, setCustomName] = useState<string | undefined>();
  const [spoken, setSpoken] = useState(false);
  const [search, setSearch] = useState('');

  // ── Hydrate from editing item ──
  useEffect(() => {
    if (visible && editing) {
      setCategory(editing.category);
      setPickedName(editing.name);
      setDuration(editing.durationMin);
      setTime(editing.time ?? null);
      setFreqMode(editing.frequency === 'daily' ? 'daily' : 'days');
      setDays(Array.isArray(editing.frequency) ? editing.frequency : []);
      setReminderOn(!!editing.notificationIds);
      // v61: spoken+tone are mutually exclusive radio options now. If the
      // saved item had spokenReminder, treat toneId as 'voice' for the UI.
      setToneId(editing.spokenReminder ? 'voice' : (editing.alarmSoundId || 'flute'));
      setCustomUri(editing.alarmCustomUri);
      setCustomName(editing.alarmCustomName);
      setSpoken(!!editing.spokenReminder);
      // v67: start edit at step 2 (name/duration) so the user can walk
      // through TIME (step 3) and TONE (step 4). Previously it jumped to
      // step 4 and Back closed the sheet, so the time could never be edited.
      setStep(2);
    } else if (visible && !editing) {
      // fresh
      setStep(1);
      setCategory(null);
      setPickedName('');
      setPickedSub('');
      setDuration(20);
      setTime(null);
      setFreqMode('daily');
      setDays([]);
      setReminderOn(true);
      setToneId('flute');
      setCustomUri(undefined);
      setCustomName(undefined);
      setSpoken(false);
      setSearch('');
    }
  }, [visible, editing]);

  // Audio player for tone preview.
  // v67: track which tone is currently sounding so a second tap TOGGLES it
  // off, and so we can stop playback when the modal closes or the user
  // leaves the tone step (previously the preview kept looping/playing).
  const [previewSrc, setPreviewSrc] = useState<any>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const player = useAudioPlayer(previewSrc);

  // Play whenever the source changes — avoids the play-before-load race
  // the old inline play() had.
  useEffect(() => {
    if (!previewSrc) return;
    try { player.seekTo(0); player.play(); } catch { /* */ }
  }, [previewSrc]);

  const stopPreview = () => {
    try { player.pause(); } catch { /* */ }
    setPlayingId(null);
  };

  // Stop audio when the wizard closes or the user navigates off step 4.
  useEffect(() => { if (!visible) stopPreview(); }, [visible]);
  useEffect(() => { if (step !== 4) stopPreview(); }, [step]);

  const playTone = (id: string) => {
    // Second tap on the same tone stops it.
    if (playingId === id) { stopPreview(); return; }
    if (id === 'custom' && customUri) {
      setPreviewSrc({ uri: customUri });
    } else {
      const t = TONES.find(x => x.id === id);
      if (!t) return;
      setPreviewSrc(t.module);
    }
    setPlayingId(id);
  };

  const pickCustomFile = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      setCustomUri(a.uri);
      setCustomName(a.name);
      setToneId('custom');
      setPreviewSrc({ uri: a.uri });
      setPlayingId('custom');
    } catch (e) { console.warn('pick failed', e); }
  };

  const save = async () => {
    if (!category) return;
    const freq = freqMode === 'daily' ? 'daily' : (days.length > 0 ? days : 'daily');
    // v61: 'voice' is a UI-only id (folded into the same radio group).
    // Persist it as spokenReminder=true + a neutral 'default' sound so
    // the platform plays its default tone alongside the spoken body.
    const isVoiceOnly = toneId === 'voice';
    const persistSpoken = spoken || isVoiceOnly;
    const persistSoundId = isVoiceOnly ? 'default' : toneId;
    let saved: RoutineItem;
    if (editing) {
      if (editing.notificationIds) await cancelRoutineReminder(editing.notificationIds);
      await routineRepo.update(editing.id, {
        category, name: pickedName, durationMin: duration, time,
        frequency: freq, alarmSoundId: reminderOn ? persistSoundId : undefined,
        alarmCustomUri: customUri, alarmCustomName: customName,
        spokenReminder: persistSpoken,
      });
      saved = { ...editing, name: pickedName, durationMin: duration, time, frequency: freq };
    } else {
      saved = await routineRepo.add({
        category, name: pickedName, durationMin: duration, time,
        frequency: freq, custom: false,
        alarmSoundId: reminderOn ? persistSoundId : undefined,
        alarmCustomUri: customUri, alarmCustomName: customName,
        spokenReminder: persistSpoken,
      });
    }
    if (reminderOn && time) {
      const granted = await requestNotificationPermission();
      if (granted) {
        const title = persistSpoken
          ? `🪷 Hey ${userName || 'friend'}`
          : `🎯 ${pickedName}`;
        const body = persistSpoken
          ? `Your ${pickedName.toLowerCase()} is at ${time} — ${duration} min`
          : `Your committed ${duration}-min practice`;
        const ids = await scheduleRoutineReminder({
          title, body, time, frequency: freq,
          routineId: saved.id, soundId: persistSoundId,
        });
        await routineRepo.update(saved.id, { notificationIds: ids });
      }
    }
    onSaved();
  };

  // ── Step 1 — category ──
  const Step1 = (
    <View>
      <Text style={ws.stepTitle}>What do you want to plan?</Text>
      <Text style={ws.stepHint}>Tap one of these.</Text>
      <View style={ws.catGrid}>
        {CATEGORIES.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[ws.catTile, category === c.id && ws.catTileActive]}
            onPress={() => { setCategory(c.id); setDuration(c.defaultMin); setStep(2); }}
            activeOpacity={0.7}
          >
            <Text style={ws.catTileIcon}>{c.icon}</Text>
            <Text style={ws.catTileLabel}>{c.label}</Text>
            <Text style={ws.catTileHint}>{c.hint}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ── Step 2 — which one ──
  const cat = category;
  const catalog = React.useMemo(() => cat ? catalogFor(cat) : [], [cat]);
  const filteredCatalog = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog.slice(0, 50);
    return catalog.filter(e =>
      e.name.toLowerCase().includes(q) || (e.sub || '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [catalog, search]);

  const Step2 = (
    <View>
      <Text style={ws.stepTitle}>Pick a {cat ? CAT_META[cat].label.toLowerCase() : 'practice'}</Text>
      <Text style={ws.stepHint}>Tap one of these, or type your own name below.</Text>
      <TextInput
        style={ws.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder="🔍  Search…"
        placeholderTextColor={COLORS.muted}
      />
      <ScrollView style={{ maxHeight: 340 }} nestedScrollEnabled>
        {filteredCatalog.map(e => {
          const isDesign = e.id === '__design__';
          return (
            <TouchableOpacity
              key={e.id}
              style={[
                ws.pickRow,
                isDesign && ws.pickRowDesign,
                pickedName === e.name && ws.pickRowActive,
              ]}
              onPress={() => {
                if (isDesign) {
                  // Clear the name so the user types their own; keep
                  // the suggested default minutes from the design entry.
                  setPickedName('');
                  setPickedSub('');
                  setDuration(e.defaultMin);
                } else {
                  setPickedName(e.name);
                  setPickedSub(e.sub || '');
                  setDuration(e.defaultMin);
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={ws.pickIcon}>{e.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[ws.pickName, isDesign && { color: COLORS.gold }]}>{e.name}</Text>
                {!!e.sub && <Text style={ws.pickSub} numberOfLines={1}>{e.sub}</Text>}
              </View>
              {isDesign
                ? <Text style={ws.pickArrow}>↓</Text>
                : <Text style={ws.pickMin}>{e.defaultMin} min</Text>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text style={ws.orLabel}>OR type your own:</Text>
      <TextInput
        style={ws.nameInput}
        value={pickedName}
        onChangeText={setPickedName}
        placeholder="e.g. Morning walk"
        placeholderTextColor={COLORS.muted}
      />
      <View style={ws.durationRow}>
        <Text style={ws.durLabel}>Minutes:</Text>
        <TextInput
          style={ws.durInput}
          value={String(duration)}
          onChangeText={(t) => setDuration(parseInt(t, 10) || 0)}
          keyboardType="numeric"
          maxLength={3}
        />
      </View>
    </View>
  );

  // ── Step 3 — when ──
  const dayBtns = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const Step3 = (
    <View>
      <Text style={ws.stepTitle}>When and how often?</Text>
      <Text style={ws.stepHint}>Pick a time and how often it should repeat.</Text>

      <Text style={ws.fieldLabel}>Time of day</Text>
      <TimePickerField value={time} onChange={setTime} placeholder="Tap to set time ⏰" />

      <Text style={ws.fieldLabel}>How often?</Text>
      <View style={ws.freqRow}>
        <TouchableOpacity
          style={[ws.freqTile, freqMode === 'daily' && ws.freqTileActive]}
          onPress={() => setFreqMode('daily')}
        >
          <Text style={ws.freqTileLabel}>Every day</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ws.freqTile, freqMode === 'days' && ws.freqTileActive]}
          onPress={() => setFreqMode('days')}
        >
          <Text style={ws.freqTileLabel}>Specific days</Text>
        </TouchableOpacity>
      </View>
      {freqMode === 'days' && (
        <View style={ws.daysRow}>
          {dayBtns.map((d, i) => (
            <TouchableOpacity
              key={d}
              style={[ws.dayChip, days.includes(i) && ws.dayChipActive]}
              onPress={() => setDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
            >
              <Text style={[ws.dayChipText, days.includes(i) && ws.dayChipTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  // ── Step 4 — how to remind ──
  const Step4 = (
    <View>
      <Text style={ws.stepTitle}>How should I remind you?</Text>
      <Text style={ws.stepHint}>Decide if you want a notification and what sound to play.</Text>

      <View style={ws.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={ws.toggleLabel}>🔔  Send notification</Text>
          <Text style={ws.toggleHint}>Lock screen alert at {time || 'the set time'}.</Text>
        </View>
        <Switch
          value={reminderOn}
          onValueChange={setReminderOn}
          trackColor={{ false: COLORS.border, true: COLORS.gold }}
          thumbColor={reminderOn ? COLORS.cream : COLORS.muted}
        />
      </View>

      {reminderOn && (
        <>
          <Text style={ws.fieldLabel}>Pick how to remind you — tap to preview</Text>
          <View>
            {TONES.map(t => {
              const selected = toneId === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[ws.radioRow, selected && ws.radioRowActive]}
                  onPress={() => { setToneId(t.id); setSpoken(false); playTone(t.id); }}
                  activeOpacity={0.7}
                >
                  <Text style={[ws.radioDot, selected && ws.radioDotActive]}>{selected ? '◉' : '○'}</Text>
                  <Text style={ws.radioIcon}>{t.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[ws.radioLabel, selected && ws.radioLabelActive]}>{t.label}</Text>
                    <Text style={ws.radioSub}>{t.sub}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {/* Custom file row */}
            <TouchableOpacity
              style={[ws.radioRow, toneId === 'custom' && ws.radioRowActive]}
              onPress={() => {
                if (customUri) { setToneId('custom'); setSpoken(false); playTone('custom'); }
                else { pickCustomFile(); }
              }}
              onLongPress={pickCustomFile}
              activeOpacity={0.7}
            >
              <Text style={[ws.radioDot, toneId === 'custom' && ws.radioDotActive]}>
                {toneId === 'custom' ? '◉' : '○'}
              </Text>
              <Text style={ws.radioIcon}>📂</Text>
              <View style={{ flex: 1 }}>
                <Text style={[ws.radioLabel, toneId === 'custom' && ws.radioLabelActive]}>
                  {customName ? customName.slice(0, 28) : 'Custom from device'}
                </Text>
                <Text style={ws.radioSub}>
                  {customName ? 'Long-press to change file' : 'Pick an mp3 from your phone'}
                </Text>
              </View>
            </TouchableOpacity>
            {/* Voice out — folded into the same radio group */}
            <TouchableOpacity
              style={[ws.radioRow, ws.radioRowVoice, toneId === 'voice' && ws.radioRowActive]}
              onPress={() => {
                stopPreview();        // silence any tone before speaking
                setToneId('voice');
                setSpoken(true);
                try {
                  ExpoSpeech.stop();
                  ExpoSpeech.speak(
                    userName
                      ? `Hey ${userName}, your ${pickedName.toLowerCase() || 'practice'} is at ${time || 'this time'}`
                      : 'Hey friend, your practice is at this time',
                    { rate: 0.9 }
                  );
                } catch { /* */ }
              }}
              activeOpacity={0.7}
            >
              <Text style={[ws.radioDot, toneId === 'voice' && ws.radioDotActive]}>
                {toneId === 'voice' ? '◉' : '○'}
              </Text>
              <Text style={ws.radioIcon}>🗣️</Text>
              <View style={{ flex: 1 }}>
                <Text style={[ws.radioLabel, toneId === 'voice' && ws.radioLabelActive]}>Voice out</Text>
                <Text style={ws.radioSub}>
                  {userName
                    ? `"Hey ${userName}, your ${pickedName.toLowerCase() || 'practice'} is at ${time || 'this time'}"`
                    : '"Hey friend, your practice is at this time"'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
          <Text style={ws.disclosure}>
            🔊 Sound previews play directly. Voice out uses your phone's built-in voice.
            Android limits notification sounds to bundled files — custom files preview here
            but the actual notification may fall back to default.
          </Text>
        </>
      )}
    </View>
  );

  // ── Navigation buttons ──
  const canNext =
    (step === 1 && !!category) ||
    (step === 2 && pickedName.trim().length > 0 && duration > 0) ||
    (step === 3 && (freqMode === 'daily' || days.length > 0));

  const onNext = () => {
    if (step < 4) setStep(step + 1);
    else save();
  };
  // v67: edit starts at step 2 (category is already known), so its lowest
  // step is 2; a fresh add starts at 1. Back below the floor closes.
  const minStep = editing ? 2 : 1;
  const onBack = () => {
    if (step > minStep) setStep(step - 1);
    else onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={ws.modal}>
        {/* Header bar */}
        <View style={ws.headerBar}>
          <Text style={ws.headerTitle}>{editing ? `Edit · step ${step} of 4` : `Step ${step} of 4`}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <Text style={ws.headerClose}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Step indicator — shown for add AND edit so the user can see the
            time / tone steps are reachable when editing. */}
        <View style={ws.stepperRow}>
          {[1,2,3,4].map(n => (
            <View key={n} style={[ws.stepperDot, step >= n && ws.stepperDotActive]} />
          ))}
        </View>

        <ScrollView contentContainerStyle={ws.body} showsVerticalScrollIndicator={false}>
          {step === 1 && Step1}
          {step === 2 && Step2}
          {step === 3 && Step3}
          {step === 4 && Step4}
        </ScrollView>

        {/* Bottom nav buttons */}
        <View style={ws.navBar}>
          <TouchableOpacity style={ws.backBtn} onPress={onBack}>
            <Text style={ws.backBtnText}>{step === 1 ? 'Cancel' : '‹ Back'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ws.nextBtn, !canNext && step !== 4 && { opacity: 0.4 }]}
            onPress={onNext}
            disabled={!canNext && step !== 4}
          >
            <Text style={ws.nextBtnText}>{step === 4 ? '✓ SAVE' : 'Next ›'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─── Occasion modal ──────────────────────────────────────────────

interface OccasionProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

const OccasionModal: React.FC<OccasionProps> = ({ visible, onClose, onSaved }) => {
  const [type, setType] = useState<OccasionType | null>(null);
  const [name, setName] = useState('');
  const [tithi, setTithi] = useState('Ekadashi');
  const [dateStr, setDateStr] = useState('');
  const [time, setTime] = useState<string | null>('06:00');
  const [festSearch, setFestSearch] = useState('');

  useEffect(() => {
    if (visible) { setType(null); setName(''); setTithi('Ekadashi'); setDateStr(''); setTime('06:00'); setFestSearch(''); }
  }, [visible]);

  const upcomingFests = React.useMemo(() => {
    try {
      const all = getUpcomingFestivals(60);
      const q = festSearch.trim().toLowerCase();
      return (q ? all.filter((f: any) => f.name.toLowerCase().includes(q)) : all).slice(0, 40);
    } catch { return []; }
  }, [festSearch, visible]);

  const saveTithi = async () => {
    if (!tithi) return;
    await specialSadhanaRepo.add({
      name: name.trim() || `${tithi} observance`,
      trigger: { kind: 'tithi', tithi }, time: time || undefined,
    });
    onSaved(`🌗 ${tithi} reminder added`);
  };
  const saveSpecial = async () => {
    const dates = dateStr.split(/[\s,]+/).filter(Boolean);
    if (!name.trim() || dates.length === 0) return;
    await specialSadhanaRepo.add({
      name: name.trim(), trigger: { kind: 'dates', dates }, time: time || undefined,
    });
    onSaved(`🗓 ${name.trim()} added`);
  };
  const saveFestival = async (fest: any) => {
    await specialSadhanaRepo.add({
      name: fest.name, note: 'festival',
      trigger: { kind: 'dates', dates: [fest.date] }, time: time || undefined,
    });
    onSaved(`🛕 ${fest.name} reminder added`);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={ws.modal}>
        <View style={ws.headerBar}>
          <Text style={ws.headerTitle}>{type ? OCCASION_TYPES.find(t => t.id === type)?.label : 'Add an occasion'}</Text>
          <TouchableOpacity onPress={type ? () => setType(null) : onClose} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <Text style={ws.headerClose}>{type ? '‹' : '✕'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={ws.body} showsVerticalScrollIndicator={false}>
          {/* Step 1 — pick a type */}
          {!type && (
            <>
              <Text style={ws.stepTitle}>What would you like to remember?</Text>
              <Text style={ws.stepHint}>Pick one.</Text>
              <View style={ws.catGrid}>
                {OCCASION_TYPES.map(t => (
                  <TouchableOpacity key={t.id} style={ws.catTile} onPress={() => setType(t.id)} activeOpacity={0.7}>
                    <Text style={ws.catTileIcon}>{t.icon}</Text>
                    <Text style={ws.catTileLabel}>{t.label}</Text>
                    <Text style={ws.catTileHint}>{t.hint}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Festival — pick from upcoming list */}
          {type === 'festival' && (
            <>
              <Text style={ws.stepTitle}>Pick a festival</Text>
              <Text style={ws.stepHint}>Tap one to add a reminder on its date.</Text>
              <Text style={ws.fieldLabel}>Remind me at</Text>
              <TimePickerField value={time} onChange={setTime} placeholder="Tap to set time ⏰" />
              <TextInput style={ws.searchInput} value={festSearch} onChangeText={setFestSearch}
                placeholder="🔍  Search festivals…" placeholderTextColor={COLORS.muted} />
              {upcomingFests.map((f: any) => (
                <TouchableOpacity key={f.id || f.name + f.date} style={ws.pickRow} onPress={() => saveFestival(f)} activeOpacity={0.7}>
                  <Text style={ws.pickIcon}>{f.deityIcon || '🛕'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={ws.pickName}>{f.name}</Text>
                    <Text style={ws.pickSub} numberOfLines={1}>{formatShortDate(f.date)}{f.deity ? ` · ${f.deity}` : ''}</Text>
                  </View>
                  <Text style={ws.pickArrow}>＋</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* Tithi — recurring lunar day */}
          {type === 'tithi' && (
            <>
              <Text style={ws.stepTitle}>Recurring tithi observance</Text>
              <Text style={ws.stepHint}>Fires every time this lunar day comes around.</Text>
              <Text style={ws.fieldLabel}>Which tithi?</Text>
              {TITHI_OPTIONS.map(t => (
                <TouchableOpacity key={t.id}
                  style={[ws.radioRow, tithi === t.id && ws.radioRowActive]}
                  onPress={() => setTithi(t.id)} activeOpacity={0.7}>
                  <Text style={[ws.radioDot, tithi === t.id && ws.radioDotActive]}>{tithi === t.id ? '◉' : '○'}</Text>
                  <Text style={ws.radioIcon}>{t.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[ws.radioLabel, tithi === t.id && ws.radioLabelActive]}>{t.id}</Text>
                    <Text style={ws.radioSub}>{t.sub}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <Text style={ws.fieldLabel}>Name (optional)</Text>
              <TextInput style={ws.nameInput} value={name} onChangeText={setName}
                placeholder={`${tithi} observance`} placeholderTextColor={COLORS.muted} />
              <Text style={ws.fieldLabel}>Remind me at</Text>
              <TimePickerField value={time} onChange={setTime} placeholder="Tap to set time ⏰" />
              <TouchableOpacity style={ws.nextBtn} onPress={saveTithi}><Text style={ws.nextBtnText}>✓ SAVE</Text></TouchableOpacity>
            </>
          )}

          {/* Special day — custom dates */}
          {type === 'special' && (
            <>
              <Text style={ws.stepTitle}>Your special day</Text>
              <Text style={ws.stepHint}>An anniversary, vrat, birthday or personal date.</Text>
              <Text style={ws.fieldLabel}>Name</Text>
              <TextInput style={ws.nameInput} value={name} onChangeText={setName}
                placeholder="e.g. Guru Diksha day" placeholderTextColor={COLORS.muted} />
              <Text style={ws.fieldLabel}>Date(s) — YYYY-MM-DD</Text>
              <TextInput style={ws.nameInput} value={dateStr} onChangeText={setDateStr}
                placeholder="2026-07-15, 2027-07-04" placeholderTextColor={COLORS.muted} />
              <Text style={ws.fieldLabel}>Remind me at</Text>
              <TimePickerField value={time} onChange={setTime} placeholder="Tap to set time ⏰" />
              <TouchableOpacity
                style={[ws.nextBtn, (!name.trim() || !dateStr.trim()) && { opacity: 0.4 }]}
                onPress={saveSpecial} disabled={!name.trim() || !dateStr.trim()}>
                <Text style={ws.nextBtnText}>✓ SAVE</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Pitru Shraadha — reuse the family-members form */}
          {type === 'shraadha' && (
            <>
              <Text style={ws.stepTitle}>Pitru Shraadha</Text>
              <Text style={ws.stepHint}>
                Add a departed loved one. We compute the annual shraadha day from the
                lunar tithi and remind you each year.
              </Text>
              <FamilyMembersCard />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

// ─── Styles ──────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  content:   { paddingVertical: SPACING.lg, paddingBottom: 60 },

  header: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  title:    { color: COLORS.cream, fontSize: 24, fontWeight: '800' },
  subtitle: { color: COLORS.muted, fontSize: 14, marginTop: 6, lineHeight: 19 },

  // v61: AI Recommendations collapsible card
  aiCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, borderRadius: 14,
    backgroundColor: 'rgba(80, 200, 180, 0.08)',
    borderWidth: 1, borderColor: 'rgba(80, 200, 180, 0.35)',
  },
  aiHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
  },
  aiTitle: { fontSize: 13, color: '#7FE8C8', fontWeight: '800', letterSpacing: 0.5, flex: 1 },
  aiTotal: { fontSize: 15, color: '#7FE8C8', fontWeight: '800' },
  aiSub:   { fontSize: 12, color: COLORS.muted, marginBottom: SPACING.sm, fontStyle: 'italic' },
  aiNote:  { fontSize: 13, color: COLORS.cream, lineHeight: 18, marginBottom: 4 },
  aiBucketRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  aiBucketIcon:  { fontSize: 16, width: 22 },
  aiBucketLabel: { fontSize: 12, color: COLORS.cream, fontWeight: '600', width: 80 },
  aiBucketTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  aiBucketFill:  { height: '100%', backgroundColor: '#7FE8C8', borderRadius: 4 },
  aiBucketMins:  { fontSize: 12, color: COLORS.cream, fontWeight: '700', width: 50, textAlign: 'right' },
  aiProvenance:  { fontSize: 10, color: COLORS.muted, marginTop: SPACING.sm, fontStyle: 'italic' },

  emptyCard: {
    marginHorizontal: SPACING.md, marginTop: SPACING.md, padding: SPACING.lg,
    borderRadius: 16, backgroundColor: COLORS.cardBg,
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.30)',
    alignItems: 'center',
  },
  emptyIcon:  { fontSize: 48, marginBottom: SPACING.sm },
  emptyTitle: { color: COLORS.gold, fontSize: 18, fontWeight: '800' },
  emptySub:   { color: COLORS.cream, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  groupLabel: {
    color: COLORS.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1.6,
    paddingHorizontal: SPACING.md, marginTop: SPACING.md, marginBottom: 6,
  },

  reminderCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    padding: SPACING.md, borderRadius: 14,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1, borderColor: COLORS.border,
    minHeight: 84,
  },
  reminderCardLeft: { width: 52, alignItems: 'center', justifyContent: 'center' },
  reminderIcon: { fontSize: 32 },
  reminderName: { color: COLORS.cream, fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  reminderMeta: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  reminderChipsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6,
  },
  timeChip:     { backgroundColor: 'rgba(255,184,0,0.18)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  timeChipText: { color: COLORS.gold, fontSize: 12, fontWeight: '700' },
  toneChip:     { backgroundColor: 'rgba(127,232,200,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  toneChipText: { color: '#7FE8C8', fontSize: 12, fontWeight: '600' },
  voiceChip:    { backgroundColor: 'rgba(192,132,252,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  voiceChipText:{ color: '#c084fc', fontSize: 12, fontWeight: '600' },

  // v61: right-side pillar — prominent NEXT countdown + delete button
  reminderCardRight: {
    alignItems: 'center', justifyContent: 'space-between',
    paddingLeft: 8, minHeight: 76, gap: 6,
  },
  nextPillar: {
    minWidth: 64, alignItems: 'center',
    paddingVertical: 6, paddingHorizontal: 6, borderRadius: 10,
    backgroundColor: 'rgba(255,184,0,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.30)',
  },
  nextLabel:    { color: COLORS.gold, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  nextValue:    { color: COLORS.cream, fontSize: 14, fontWeight: '800', marginTop: 2 },
  nextTomorrow: { color: COLORS.muted, fontSize: 9, marginTop: 1, fontStyle: 'italic' },
  editPencil:   { fontSize: 18 },
  deleteBtn:    { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  deleteBtnText:{ color: COLORS.muted, fontSize: 14, fontWeight: '700' },

  addBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.lg,
    backgroundColor: COLORS.deep, borderTopWidth: 1, borderTopColor: 'rgba(255,184,0,0.30)',
  },
  addBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 14,
    backgroundColor: COLORS.gold,
    shadowColor: '#FFB800', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  addBtnText: { color: COLORS.deep, fontSize: 17, fontWeight: '800', letterSpacing: 0.4 },

  // v67: Sacred Days & Occasions
  occHeaderRow: { marginTop: SPACING.lg },
  occIntro: { color: COLORS.muted, fontSize: 12, paddingHorizontal: SPACING.md, marginBottom: SPACING.sm, lineHeight: 17, fontStyle: 'italic' },
  occEmpty: { color: COLORS.muted, fontSize: 13, textAlign: 'center', paddingVertical: SPACING.md, fontStyle: 'italic' },
  occCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    padding: SPACING.md, borderRadius: 14,
    backgroundColor: COLORS.cardBg, borderWidth: 1, borderColor: 'rgba(244,114,182,0.30)',
  },
  occCardIcon: { fontSize: 26, width: 36, textAlign: 'center' },
  occCardName: { color: COLORS.cream, fontSize: 16, fontWeight: '700' },
  occCardSub:  { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  occDelete:   { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  occAddBtn: {
    marginHorizontal: SPACING.md, marginTop: 4, paddingVertical: 14, borderRadius: 14,
    backgroundColor: 'rgba(244,114,182,0.12)', borderWidth: 1, borderColor: 'rgba(244,114,182,0.45)',
    alignItems: 'center',
  },
  occAddBtnText: { color: '#f472b6', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

  // v68: inline gold CTA for the daily-practice section (replaces the old
  // floating bottom bar so body & soul reminders have a clear add button).
  dailyAddBtn: {
    marginHorizontal: SPACING.md, marginTop: 4, marginBottom: SPACING.md,
    paddingVertical: 16, borderRadius: 14, backgroundColor: COLORS.gold,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FFB800', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  dailyAddBtnText: { color: COLORS.deep, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});

const ws = StyleSheet.create({
  modal: { flex: 1, backgroundColor: COLORS.deep, paddingTop: 48 },

  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { color: COLORS.cream, fontSize: 16, fontWeight: '800' },
  headerClose: { color: COLORS.cream, fontSize: 22, fontWeight: '700' },

  stepperRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    paddingVertical: SPACING.sm,
  },
  stepperDot: {
    width: 32, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  stepperDotActive: { backgroundColor: COLORS.gold },

  body: { padding: SPACING.lg, paddingBottom: 120 },

  stepTitle: { color: COLORS.cream, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  stepHint:  { color: COLORS.muted, fontSize: 14, marginBottom: SPACING.lg, lineHeight: 19 },

  catGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  catTile: {
    width: '47%', padding: SPACING.md, borderRadius: 14, minHeight: 110,
    backgroundColor: COLORS.cardBg, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  catTileActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(255,184,0,0.10)' },
  catTileIcon:  { fontSize: 38, marginBottom: 6 },
  catTileLabel: { color: COLORS.cream, fontSize: 16, fontWeight: '800' },
  catTileHint:  { color: COLORS.muted, fontSize: 11, marginTop: 4, textAlign: 'center' },

  searchInput: {
    backgroundColor: COLORS.cardBg, borderRadius: 12, padding: SPACING.md,
    color: COLORS.cream, fontSize: 16, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  pickRowActive: { backgroundColor: 'rgba(255,184,0,0.10)', borderRadius: 8 },
  pickRowDesign: {
    backgroundColor: 'rgba(255,184,0,0.08)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,184,0,0.35)',
    marginBottom: 4,
  },
  pickIcon: { fontSize: 24, width: 32 },
  pickName: { color: COLORS.cream, fontSize: 16, fontWeight: '600' },
  pickSub:  { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  pickMin:  { color: COLORS.gold, fontSize: 13, fontWeight: '700' },
  pickArrow:{ color: COLORS.gold, fontSize: 16, fontWeight: '800' },

  orLabel:   { color: COLORS.muted, fontSize: 13, marginTop: SPACING.md, marginBottom: 6, textAlign: 'center' },
  nameInput: {
    backgroundColor: COLORS.cardBg, borderRadius: 12, padding: SPACING.md,
    color: COLORS.cream, fontSize: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: SPACING.md },
  durLabel:    { color: COLORS.cream, fontSize: 15, fontWeight: '700' },
  durInput: {
    flex: 1, backgroundColor: COLORS.cardBg, borderRadius: 12, padding: SPACING.md,
    color: COLORS.cream, fontSize: 16, textAlign: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },

  fieldLabel: { color: COLORS.cream, fontSize: 14, fontWeight: '800', letterSpacing: 0.5, marginTop: SPACING.md, marginBottom: 8 },

  freqRow: { flexDirection: 'row', gap: 10 },
  freqTile: {
    flex: 1, padding: SPACING.md, borderRadius: 12,
    backgroundColor: COLORS.cardBg, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center',
  },
  freqTileActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(255,184,0,0.10)' },
  freqTileLabel: { color: COLORS.cream, fontSize: 15, fontWeight: '700' },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  dayChip: {
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: COLORS.cardBg, borderWidth: 1, borderColor: COLORS.border,
  },
  dayChipActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  dayChipText:   { color: COLORS.cream, fontSize: 13, fontWeight: '700' },
  dayChipTextActive: { color: COLORS.deep },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.cardBg, borderRadius: 12,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    marginTop: SPACING.sm,
  },
  toggleLabel: { color: COLORS.cream, fontSize: 15, fontWeight: '700' },
  toggleHint:  { color: COLORS.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },

  // v61: vertical radio list (tones + custom + voice-out) — replaces the old toneGrid
  radioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: SPACING.md,
    borderRadius: 12, marginBottom: 6,
    backgroundColor: COLORS.cardBg, borderWidth: 1, borderColor: COLORS.border,
  },
  radioRowActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(255,184,0,0.10)' },
  radioRowVoice:  { backgroundColor: 'rgba(192,132,252,0.08)', borderColor: 'rgba(192,132,252,0.30)' },
  radioDot:       { fontSize: 20, color: COLORS.muted, width: 24, textAlign: 'center' },
  radioDotActive: { color: COLORS.gold },
  radioIcon:      { fontSize: 22, width: 28, textAlign: 'center' },
  radioLabel:     { color: COLORS.cream, fontSize: 15, fontWeight: '700' },
  radioLabelActive:{ color: COLORS.gold, fontWeight: '800' },
  radioSub:       { color: COLORS.muted, fontSize: 12, marginTop: 2, lineHeight: 16 },

  disclosure: {
    color: COLORS.muted, fontSize: 11, fontStyle: 'italic',
    marginTop: 8, lineHeight: 16,
  },

  navBar: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.lg,
    backgroundColor: COLORS.deep, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  backBtn: {
    flex: 1, paddingVertical: 16, borderRadius: 12,
    backgroundColor: COLORS.cardBg, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  backBtnText: { color: COLORS.cream, fontSize: 15, fontWeight: '700' },
  nextBtn: {
    flex: 2, paddingVertical: 16, borderRadius: 12,
    backgroundColor: COLORS.gold, alignItems: 'center',
  },
  nextBtnText: { color: COLORS.deep, fontSize: 16, fontWeight: '800' },
});
