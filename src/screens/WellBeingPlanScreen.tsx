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

const catalogFor = (cat: RoutineCategory): PickEntry[] => {
  if (cat === 'exercise') return EXERCISE_CATALOG.map((e: any) => ({
    id: e.id, name: e.name, icon: e.icon || '🏃', sub: e.subtitle || '',
    defaultMin: Math.max(5, Math.round((e.durationSec || 1800) / 60)),
  }));
  if (cat === 'yoga') return YOGA_CATALOG.map((y: any) => ({
    id: y.id, name: y.name, icon: '🧘', sub: y.sanskrit || '',
    defaultMin: Math.max(5, Math.round((y.durationSec || 600) / 60)),
  }));
  if (cat === 'meditate') return MEDITATION_CATALOG.map((m: any) => ({
    id: m.id, name: m.name, icon: '🪷', sub: m.subtitle || '',
    defaultMin: Math.max(5, Math.round((m.durationSec || 600) / 60)),
  }));
  if (cat === 'japa') return ALL_CATALOG_DEITIES
    .map((d: any) => ({ id: d.id, name: d.name, icon: d.icon || '🪷', sub: d.mantra || '', defaultMin: 15 }))
    .sort((a, b) => popRank(a.name) - popRank(b.name));
  if (cat === 'sandhya') return [
    { id: 'pratah',      name: 'Pratah Sandhya',      icon: '🌅', sub: 'Dawn juncture', defaultMin: 10 },
    { id: 'madhyahnika', name: 'Madhyahnika Sandhya', icon: '🌞', sub: 'Noon juncture', defaultMin: 10 },
    { id: 'sayam',       name: 'Sayam Sandhya',       icon: '🌇', sub: 'Dusk juncture', defaultMin: 10 },
  ];
  return [];
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

const timeUntil = (hhmm?: string | null) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(s => parseInt(s, 10) || 0);
  const t = new Date(); t.setHours(h, m, 0, 0);
  const ms = t.getTime() - Date.now();
  if (ms < -60_000) return 'past';
  if (Math.abs(ms) < 60_000) return 'now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins} min`;
  return `in ${Math.round(mins / 60)}h`;
};

// ─── Main screen ────────────────────────────────────────────────

export const WellBeingPlanScreen = ({ navigation }: any) => {
  const { showToast, userProfile } = useSadhana();
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RoutineItem | null>(null);

  const refresh = async () => setItems(await routineRepo.list());
  useEffect(() => { refresh(); }, []);

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

        {/* Empty state */}
        {items.length === 0 && (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🌱</Text>
            <Text style={s.emptyTitle}>No reminders yet</Text>
            <Text style={s.emptySub}>
              Tap the gold button below to set your first reminder.
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
              {list.map(it => (
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
                      {it.time && (
                        <View style={s.untilChip}>
                          <Text style={s.untilChipText}>{timeUntil(it.time)}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={s.reminderCardRight}>
                    <Text style={s.editPencil}>✏️</Text>
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation?.(); handleDelete(it.id); }}
                      hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                      style={s.deleteBtn}
                    >
                      <Text style={s.deleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}

        {/* Bottom spacer so the floating Save bar doesn't cover content */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Big gold Add button */}
      <View style={s.addBar}>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => setWizardOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={s.addBtnText}>＋  Add a new reminder</Text>
        </TouchableOpacity>
      </View>

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
      setToneId(editing.alarmSoundId || 'flute');
      setCustomUri(editing.alarmCustomUri);
      setCustomName(editing.alarmCustomName);
      setSpoken(!!editing.spokenReminder);
      setStep(4);   // jump straight to the editable details
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

  // Audio player for tone preview
  const [previewSrc, setPreviewSrc] = useState<any>(null);
  const player = useAudioPlayer(previewSrc);
  const playTone = (id: string) => {
    if (id === 'custom' && customUri) {
      setPreviewSrc({ uri: customUri });
    } else {
      const t = TONES.find(x => x.id === id);
      if (!t) return;
      setPreviewSrc(t.module);
    }
    try { player.seekTo(0); player.play(); } catch { /* */ }
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
      try { player.seekTo(0); player.play(); } catch { /* */ }
    } catch (e) { console.warn('pick failed', e); }
  };

  const save = async () => {
    if (!category) return;
    const freq = freqMode === 'daily' ? 'daily' : (days.length > 0 ? days : 'daily');
    let saved: RoutineItem;
    if (editing) {
      if (editing.notificationIds) await cancelRoutineReminder(editing.notificationIds);
      await routineRepo.update(editing.id, {
        category, name: pickedName, durationMin: duration, time,
        frequency: freq, alarmSoundId: reminderOn ? toneId : undefined,
        alarmCustomUri: customUri, alarmCustomName: customName,
        spokenReminder: spoken,
      });
      saved = { ...editing, name: pickedName, durationMin: duration, time, frequency: freq };
    } else {
      saved = await routineRepo.add({
        category, name: pickedName, durationMin: duration, time,
        frequency: freq, custom: false,
        alarmSoundId: reminderOn ? toneId : undefined,
        alarmCustomUri: customUri, alarmCustomName: customName,
        spokenReminder: spoken,
      });
    }
    if (reminderOn && time) {
      const granted = await requestNotificationPermission();
      if (granted) {
        const title = spoken
          ? `🪷 Hey ${userName || 'friend'}`
          : `🎯 ${pickedName}`;
        const body = spoken
          ? `Your ${pickedName.toLowerCase()} is at ${time} — ${duration} min`
          : `Your committed ${duration}-min practice`;
        const ids = await scheduleRoutineReminder({
          title, body, time, frequency: freq,
          routineId: saved.id, soundId: toneId,
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
        {filteredCatalog.map(e => (
          <TouchableOpacity
            key={e.id}
            style={[ws.pickRow, pickedName === e.name && ws.pickRowActive]}
            onPress={() => { setPickedName(e.name); setPickedSub(e.sub || ''); setDuration(e.defaultMin); }}
            activeOpacity={0.7}
          >
            <Text style={ws.pickIcon}>{e.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={ws.pickName}>{e.name}</Text>
              {!!e.sub && <Text style={ws.pickSub} numberOfLines={1}>{e.sub}</Text>}
            </View>
            <Text style={ws.pickMin}>{e.defaultMin} min</Text>
          </TouchableOpacity>
        ))}
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
          <Text style={ws.fieldLabel}>🎵  Pick a tone — tap to hear it</Text>
          <View style={ws.toneGrid}>
            {TONES.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[ws.toneTile, toneId === t.id && ws.toneTileActive]}
                onPress={() => { setToneId(t.id); playTone(t.id); }}
                activeOpacity={0.7}
              >
                <Text style={ws.toneIcon}>{t.icon}</Text>
                <Text style={[ws.toneLabel, toneId === t.id && ws.toneLabelActive]}>{t.label}</Text>
                <Text style={ws.toneSub}>{t.sub}</Text>
              </TouchableOpacity>
            ))}
            {/* Custom file tile */}
            <TouchableOpacity
              style={[ws.toneTile, toneId === 'custom' && ws.toneTileActive]}
              onPress={() => { if (customUri) { setToneId('custom'); playTone('custom'); } else { pickCustomFile(); } }}
              onLongPress={pickCustomFile}
              activeOpacity={0.7}
            >
              <Text style={ws.toneIcon}>📂</Text>
              <Text style={[ws.toneLabel, toneId === 'custom' && ws.toneLabelActive]}>
                {customName ? customName.slice(0, 12) : 'Custom'}
              </Text>
              <Text style={ws.toneSub}>{customName ? 'Long-press: swap' : 'Pick from phone'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={ws.disclosure}>
            🔊 The PREVIEW above plays the exact tone. Android limits notification
            sounds to bundled files — picked custom files preview here but the
            actual notification may fall back to default.
          </Text>

          <View style={ws.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={ws.toggleLabel}>🗣️  Speak my name aloud</Text>
              <Text style={ws.toggleHint}>
                {userName
                  ? `"Hey ${userName}, your ${pickedName.toLowerCase() || 'practice'} is at ${time || 'this time'}"`
                  : '"Hey friend, your practice is at this time"'}
              </Text>
            </View>
            <Switch
              value={spoken}
              onValueChange={setSpoken}
              trackColor={{ false: COLORS.border, true: COLORS.gold }}
              thumbColor={spoken ? COLORS.cream : COLORS.muted}
            />
          </View>
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
  const onBack = () => {
    if (editing && step === 4) return onClose();      // edit jumps straight to step 4
    if (step > 1) setStep(step - 1);
    else onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={ws.modal}>
        {/* Header bar */}
        <View style={ws.headerBar}>
          <Text style={ws.headerTitle}>{editing ? 'Edit reminder' : `Step ${step} of 4`}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <Text style={ws.headerClose}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Step indicator */}
        {!editing && (
          <View style={ws.stepperRow}>
            {[1,2,3,4].map(n => (
              <View key={n} style={[ws.stepperDot, step >= n && ws.stepperDotActive]} />
            ))}
          </View>
        )}

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

// ─── Styles ──────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  content:   { paddingVertical: SPACING.lg, paddingBottom: 60 },

  header: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  title:    { color: COLORS.cream, fontSize: 24, fontWeight: '800' },
  subtitle: { color: COLORS.muted, fontSize: 14, marginTop: 6, lineHeight: 19 },

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
  untilChip:    { backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  untilChipText:{ color: COLORS.muted, fontSize: 11, fontStyle: 'italic' },

  reminderCardRight: { alignItems: 'center', justifyContent: 'space-between', paddingLeft: 6, height: 72 },
  editPencil: { fontSize: 18 },
  deleteBtn:  { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { color: COLORS.muted, fontSize: 14, fontWeight: '700' },

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
  pickIcon: { fontSize: 24, width: 32 },
  pickName: { color: COLORS.cream, fontSize: 16, fontWeight: '600' },
  pickSub:  { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  pickMin:  { color: COLORS.gold, fontSize: 13, fontWeight: '700' },

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

  toneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toneTile: {
    width: '31%', minHeight: 100, padding: 10, borderRadius: 12,
    backgroundColor: COLORS.cardBg, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  toneTileActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(255,184,0,0.12)' },
  toneIcon:  { fontSize: 24, marginBottom: 4 },
  toneLabel: { color: COLORS.cream, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  toneLabelActive: { color: COLORS.gold, fontWeight: '800' },
  toneSub:   { color: COLORS.muted, fontSize: 10, marginTop: 2, textAlign: 'center' },

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
