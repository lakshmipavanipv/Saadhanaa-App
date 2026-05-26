/**
 * MeditationScreen — anxiety-relief & meditation hub.
 *
 * Library of guided techniques, organized by intent:
 *   • Quick Relief (1-3 min)  — when anxiety strikes RIGHT NOW
 *   • Calming      (5-15 min) — daily preventive practice
 *   • Deeper       (15-30 min)— body scan, yoga nidra
 *   • Mantra Japa  — peace-focused mantras with bead counter
 *
 * Wired to AnxietyDetector via the `?openId=...` route param so the
 * GroundingOverlay can direct the user straight to a chosen technique
 * after the ring buzzes.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity, Modal, Animated,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { SoulsyncSessionBar } from '../soulsync/components/SoulsyncSessionBar';

type Intent = 'quick' | 'calm' | 'deep' | 'mantra' | 'cooling';

interface Technique {
  id: string;
  name: string;
  subtitle: string;
  intent: Intent;
  durationSec: number;
  /** For breath-paced techniques: { in, hold1, out, hold2 } seconds. */
  breath?: { in: number; hold1: number; out: number; hold2: number; rounds?: number };
  /** Plain instructions. */
  instructions: string[];
  /** Optional mantra to chant inline (with simple counter). */
  mantra?: { sanskrit: string; transliteration: string; meaning: string; targetCount: number };
  /** Optional warning shown in a callout. */
  contraindications?: string;
}

const TECHNIQUES: Technique[] = [
  // ── QUICK RELIEF — anxiety SOS ──
  {
    id: 'box-breath',
    name: 'Box Breathing',
    subtitle: 'Navy SEAL technique · 4-4-4-4',
    intent: 'quick',
    durationSec: 240,
    breath: { in: 4, hold1: 4, out: 4, hold2: 4, rounds: 12 },
    instructions: [
      'Sit upright, feet flat, hands relaxed',
      'Inhale through nose for 4 counts',
      'Hold breath for 4 counts',
      'Exhale through nose for 4 counts',
      'Hold empty for 4 counts',
      '12 rounds — within 4 minutes anxiety drops sharply',
    ],
  },
  {
    id: 'four-seven-eight',
    name: '4-7-8 Breath',
    subtitle: 'Dr. Weil — fastest natural sedative',
    intent: 'quick',
    durationSec: 180,
    breath: { in: 4, hold1: 7, out: 8, hold2: 0, rounds: 4 },
    instructions: [
      'Tongue tip touches ridge behind upper teeth',
      'Exhale fully through mouth (whoosh)',
      'Close mouth, inhale through nose for 4',
      'Hold breath for 7',
      'Exhale through mouth for 8 (whoosh)',
      '4 rounds is plenty — works fast',
    ],
  },
  {
    id: '5-4-3-2-1-grounding',
    name: '5-4-3-2-1 Grounding',
    subtitle: 'Sensory grounding · for panic',
    intent: 'quick',
    durationSec: 120,
    instructions: [
      'Sit anywhere. Open your eyes.',
      'Name 5 things you can SEE around you',
      'Name 4 things you can TOUCH (and touch them)',
      'Name 3 things you can HEAR',
      'Name 2 things you can SMELL',
      'Name 1 thing you can TASTE',
      'You are here. You are safe. You are now.',
    ],
  },
  {
    id: 'physiological-sigh',
    name: 'Physiological Sigh',
    subtitle: 'Andrew Huberman · fastest stress relief',
    intent: 'quick',
    durationSec: 90,
    breath: { in: 3, hold1: 0, out: 6, hold2: 0, rounds: 8 },
    instructions: [
      'Inhale through nose deeply',
      'Without exhaling, inhale a SECOND short sip (top off the lungs)',
      'Long, slow exhale through the mouth',
      'Repeat 8 times — proven to drop cortisol within 90 seconds',
    ],
  },

  // ── CALMING — daily practice ──
  {
    id: 'nadi-shodhana',
    name: 'Nadi Shodhana',
    subtitle: 'Alternate-nostril breathing',
    intent: 'calm',
    durationSec: 600,
    breath: { in: 4, hold1: 4, out: 4, hold2: 0, rounds: 20 },
    instructions: [
      'Sit comfortably, spine tall',
      'Right hand: thumb to right nostril, ring finger to left',
      'Close right nostril, inhale through left (4 counts)',
      'Hold, then close left and exhale through right (4 counts)',
      'Inhale through right (4), exhale through left (4)',
      'That is one round. Do 20 rounds.',
    ],
  },
  {
    id: 'so-hum',
    name: 'So-Hum Mantra Meditation',
    subtitle: '"I am That" — natural breath mantra',
    intent: 'calm',
    durationSec: 900,
    instructions: [
      'Sit comfortably, eyes closed',
      'Breathe naturally — do not force',
      'On inhale, mentally say "SO"',
      'On exhale, mentally say "HUM"',
      'When mind wanders (it will), gently return',
      'Continue 15 minutes',
    ],
    mantra: {
      sanskrit: 'सो हं',
      transliteration: 'So-Hum',
      meaning: '"I am That" — the natural sound of the breath itself',
      targetCount: 108,
    },
  },

  // ── DEEPER — long form ──
  {
    id: 'body-scan',
    name: 'Body Scan',
    subtitle: 'Mindful relaxation · head to toe',
    intent: 'deep',
    durationSec: 1200,
    instructions: [
      'Lie down comfortably (Shavasana)',
      'Bring attention to crown of head — notice without changing',
      'Slowly move down: forehead, eyes, jaw, neck',
      'Shoulders, arms, hands — release each',
      'Chest, abdomen, lower back — soften',
      'Hips, thighs, knees, calves, feet',
      'Then rest in whole-body awareness 5 min',
    ],
  },
  {
    id: 'yoga-nidra',
    name: 'Yoga Nidra Sankalpa',
    subtitle: 'Conscious sleep · deep healing',
    intent: 'deep',
    durationSec: 1800,
    instructions: [
      'Lie in Shavasana, fully supported',
      'Set a Sankalpa (resolve) — a positive short statement, present tense',
      'Repeat it three times silently',
      'Rotate awareness through body parts (right thumb → fingers → wrist...)',
      'Notice opposites: heavy/light, hot/cold, joy/sorrow',
      'Visualize sacred symbols or images',
      'Return to Sankalpa, then slowly return to room',
    ],
  },

  // ── COOLING — for anger / agitation ──
  {
    id: 'shitali-breath',
    name: 'Shitali Cooling Breath',
    subtitle: 'Tongue-curl inhale · drops body heat',
    intent: 'cooling',
    durationSec: 180,
    breath: { in: 4, hold1: 2, out: 4, hold2: 0, rounds: 12 },
    instructions: [
      'Sit comfortably, spine tall',
      'Curl your tongue into a tube (or purse lips if you cannot)',
      'Inhale slowly through the tube — feel cool air on the tongue',
      'Close mouth, hold briefly',
      'Exhale slowly through nose',
      '12 rounds — body temperature drops noticeably',
    ],
    contraindications: 'Avoid in cold weather or with low BP',
  },
  {
    id: 'chandra-bhedana',
    name: 'Left Nostril Breathing',
    subtitle: 'Chandra Bhedana · cooling lunar channel',
    intent: 'cooling',
    durationSec: 240,
    breath: { in: 4, hold1: 4, out: 6, hold2: 0, rounds: 15 },
    instructions: [
      'Sit comfortably, right hand to nose',
      'Close RIGHT nostril with right thumb',
      'Inhale slowly through LEFT nostril (4 counts)',
      'Hold briefly (4 counts)',
      'Switch — close LEFT nostril with ring finger, open right',
      'Exhale through RIGHT (6 counts)',
      'Inhale again through LEFT (always). 15 rounds.',
      'Activates the parasympathetic (calming) nervous system.',
    ],
  },
  {
    id: 'cold-water-reset',
    name: 'Cold Water Reset',
    subtitle: 'Vagus-nerve activation · instant cooling',
    intent: 'cooling',
    durationSec: 60,
    instructions: [
      'Stand at the sink, no rush',
      'Splash cold water on your face — eyes closed, forehead, cheeks',
      'Hold cold water against the back of your neck for 15 seconds',
      'Cold on the wrists for 15 more seconds',
      'Triggers the mammalian dive reflex — vagus nerve activates, heart slows, body cools',
      'Dry off, breathe naturally, return',
    ],
  },
  {
    id: 'ahimsa-contemplation',
    name: 'Ahimsa & Forgiveness',
    subtitle: 'Loving-kindness for the moment of anger',
    intent: 'cooling',
    durationSec: 300,
    instructions: [
      'Sit quietly. Notice the body — where is the heat? Tension?',
      'Bring to mind the person or situation that triggered you',
      'Silently say: "I forgive you. I forgive myself."',
      'Then: "May you be well. May you be peaceful. May you be free from suffering."',
      'Then: "May I be well. May I be peaceful. May I be free from suffering."',
      'When the heat eases, sit in the resulting space',
      'This is Ahimsa in action — non-violence even in thought.',
    ],
  },

  // ── MANTRA JAPA ──
  {
    id: 'gayatri-japa',
    name: 'Gayatri Mantra Japa',
    subtitle: 'The mother of all mantras',
    intent: 'mantra',
    durationSec: 600,
    instructions: [
      'Sit facing east, spine tall',
      'Optionally hold your mala or use Saadhana Ring',
      'Chant slowly, with feeling',
      '108 repetitions = 1 mala',
    ],
    mantra: {
      sanskrit: 'ॐ भूर्भुवः स्वः । तत्सवितुर्वरेण्यं । भर्गो देवस्य धीमहि । धियो यो नः प्रचोदयात् ।',
      transliteration: 'Om Bhur Bhuvah Svah · Tat Savitur Varenyam · Bhargo Devasya Dhimahi · Dhiyo Yo Nah Pracodayat',
      meaning: 'We meditate on the divine light of Savitr. May He inspire our intellect.',
      targetCount: 108,
    },
  },
  {
    id: 'maha-mrityunjaya',
    name: 'Maha Mrityunjaya',
    subtitle: 'Healing & protection · Shiva mantra',
    intent: 'mantra',
    durationSec: 600,
    instructions: [
      'Chant slowly, dwelling on each syllable',
      'Particularly powerful for anxiety, illness, fear',
      '108 or 1008 repetitions',
    ],
    mantra: {
      sanskrit: 'ॐ त्र्यम्बकं यजामहे सुगन्धिं पुष्टिवर्धनम् । उर्वारुकमिव बन्धनान्मृत्योर्मुक्षीय मामृतात् ।',
      transliteration: 'Om Tryambakam Yajamahe · Sugandhim Pushti-Vardhanam · Urvarukam-iva Bandhanan · Mrityor-Mukshiya Maamritat',
      meaning: 'We meditate on the three-eyed One who nourishes all. May He release us from death into immortality, like a ripe cucumber from the vine.',
      targetCount: 108,
    },
  },
  {
    id: 'om-meditation',
    name: 'Om / Pranava Meditation',
    subtitle: 'The primordial sound',
    intent: 'mantra',
    durationSec: 600,
    instructions: [
      'Sit comfortably, spine tall',
      'Take 3 deep breaths',
      'On exhale, chant Om — long: "Aaa-Ooo-Mmm-silence"',
      'Feel the vibration in the throat (Aaa), chest (Ooo), skull (Mmm)',
      '10–20 rounds, then sit in the silence',
    ],
    mantra: {
      sanskrit: 'ॐ',
      transliteration: 'Aum / Om',
      meaning: 'The sound of universal vibration. Beginning and end of every mantra.',
      targetCount: 108,
    },
  },
];

const INTENTS: { id: Intent | 'all'; label: string; icon: string; sub: string }[] = [
  { id: 'all',     label: 'All',          icon: '🧘', sub: 'Everything' },
  { id: 'quick',   label: 'Quick Relief', icon: '🆘', sub: 'For anxiety right now (1-4 min)' },
  { id: 'cooling', label: 'Cooling',      icon: '❄️', sub: 'For anger / agitation' },
  { id: 'calm',    label: 'Daily Calm',   icon: '🌊', sub: 'Preventive practice (10-15 min)' },
  { id: 'deep',    label: 'Deep Rest',    icon: '🌙', sub: 'Body scan, yoga nidra (20-30 min)' },
  { id: 'mantra',  label: 'Mantra Japa',  icon: '📿', sub: 'Peace-focused mantras' },
];

interface Props {
  /** Optional route param: technique id to auto-open (deep-link from anxiety overlay). */
  route?: { params?: { openId?: string } };
  navigation?: any;
}

const fmtSec = (s: number): string => s >= 60 ? `${Math.round(s / 60)} min` : `${s} sec`;

export const MeditationScreen: React.FC<Props> = ({ route, navigation }) => {
  const [filter, setFilter] = useState<Intent | 'all'>('all');
  const [selected, setSelected] = useState<Technique | null>(null);

  // Deep-link: if route?.params?.openId is set (e.g. from anxiety overlay),
  // auto-open that technique.
  useEffect(() => {
    const openId = route?.params?.openId;
    if (openId) {
      const t = TECHNIQUES.find(t => t.id === openId);
      if (t) {
        setSelected(t);
        navigation?.setParams?.({ openId: undefined });
      }
    }
  }, [route?.params?.openId]);

  const filtered = filter === 'all' ? TECHNIQUES : TECHNIQUES.filter(t => t.intent === filter);
  const quickRelief = TECHNIQUES.filter(t => t.intent === 'quick');

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Meditation</Text>
          <Text style={styles.subtitle}>Anxiety relief · daily calm · mantra japa</Text>
        </View>

        {/* Soulsync — start before meditation to capture HRV / BPM */}
        <SoulsyncSessionBar
          practice="meditation"
          onViewInsights={() => navigation?.navigate?.('History')}
        />

        {/* SOS — quick relief block (always visible at top) */}
        <View style={styles.sosCard}>
          <Text style={styles.sosLabel}>🆘  IF YOU ARE FEELING ANXIOUS NOW</Text>
          {quickRelief.slice(0, 3).map(t => (
            <TouchableOpacity key={t.id} style={styles.sosRow} onPress={() => setSelected(t)}>
              <Text style={styles.sosName}>{t.name}</Text>
              <Text style={styles.sosDur}>{fmtSec(t.durationSec)} ›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {INTENTS.map(c => (
            <TouchableOpacity
              key={c.id}
              style={[styles.filterChip, filter === c.id && styles.filterChipActive]}
              onPress={() => setFilter(c.id)}
            >
              <Text style={styles.filterIcon}>{c.icon}</Text>
              <Text style={[styles.filterLabel, filter === c.id && styles.filterLabelActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Full list */}
        {filtered.map(t => (
          <TouchableOpacity key={t.id} style={styles.listCard} onPress={() => setSelected(t)}>
            <Text style={styles.listIcon}>{INTENTS.find(c => c.id === t.intent)?.icon || '🧘'}</Text>
            <View style={{ flex: 1, marginLeft: SPACING.sm }}>
              <Text style={styles.listName}>{t.name}</Text>
              <Text style={styles.listSub}>{t.subtitle}</Text>
            </View>
            <Text style={styles.listDur}>{fmtSec(t.durationSec)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {selected && (
        <TechniqueModal technique={selected} onClose={() => setSelected(null)} />
      )}
    </View>
  );
};

// ─── Detail modal with breath timer + mantra counter ────────────

const TechniqueModal: React.FC<{ technique: Technique; onClose: () => void }> = ({ technique, onClose }) => {
  const [remaining, setRemaining] = useState(technique.durationSec);
  const [running, setRunning] = useState(false);
  const [japaCount, setJapaCount] = useState(0);
  const [breathPhase, setBreathPhase] = useState<'inhale' | 'hold1' | 'exhale' | 'hold2' | 'idle'>('idle');
  const [breathSecondsLeft, setBreathSecondsLeft] = useState(0);
  const scale = useRef(new Animated.Value(0.6)).current;
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breathRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Overall timer
  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { setRunning(false); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [running]);

  // Breath-pace animation (for techniques with a breath pattern)
  useEffect(() => {
    if (!running || !technique.breath) { setBreathPhase('idle'); return; }
    const { in: inSec, hold1, out, hold2 } = technique.breath;

    const cycle = [
      { phase: 'inhale' as const, seconds: inSec, animTo: 1.0 },
      ...(hold1 > 0 ? [{ phase: 'hold1' as const, seconds: hold1, animTo: 1.0 }] : []),
      { phase: 'exhale' as const, seconds: out, animTo: 0.6 },
      ...(hold2 > 0 ? [{ phase: 'hold2' as const, seconds: hold2, animTo: 0.6 }] : []),
    ];
    let stepIdx = 0;
    let secondsInStep = 0;

    const start = () => {
      const step = cycle[stepIdx];
      setBreathPhase(step.phase);
      setBreathSecondsLeft(step.seconds);
      Animated.timing(scale, {
        toValue: step.animTo,
        duration: step.seconds * 1000,
        useNativeDriver: true,
      }).start();
    };

    start();
    breathRef.current = setInterval(() => {
      secondsInStep += 1;
      const step = cycle[stepIdx];
      const left = Math.max(0, step.seconds - secondsInStep);
      setBreathSecondsLeft(left);
      if (left === 0) {
        stepIdx = (stepIdx + 1) % cycle.length;
        secondsInStep = 0;
        start();
      }
    }, 1000);

    return () => { if (breathRef.current) clearInterval(breathRef.current); };
  }, [running, technique]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  const phaseLabel =
    breathPhase === 'inhale' ? 'Inhale' :
    breathPhase === 'hold1'  ? 'Hold' :
    breathPhase === 'exhale' ? 'Exhale' :
    breathPhase === 'hold2'  ? 'Hold' : '';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailName}>{technique.name}</Text>
                <Text style={styles.detailSub}>{technique.subtitle}</Text>
              </View>
              <TouchableOpacity onPress={onClose}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>

            {/* Breath visualizer (when applicable) */}
            {technique.breath && running && (
              <View style={styles.breathArea}>
                <Animated.View style={[styles.breathOrb, { transform: [{ scale }] }]} />
                <Text style={styles.breathPhase}>{phaseLabel}</Text>
                <Text style={styles.breathCount}>{breathSecondsLeft}</Text>
              </View>
            )}

            {/* Mantra display (when applicable) */}
            {technique.mantra && (
              <View style={styles.mantraCard}>
                <Text style={styles.mantraSans}>{technique.mantra.sanskrit}</Text>
                <Text style={styles.mantraTrans}>{technique.mantra.transliteration}</Text>
                <Text style={styles.mantraMean}>{technique.mantra.meaning}</Text>
                <View style={styles.japaRow}>
                  <Text style={styles.japaCount}>{japaCount} / {technique.mantra.targetCount}</Text>
                  <TouchableOpacity
                    style={styles.japaTapBtn}
                    onPress={() => setJapaCount(c => c + 1)}
                  >
                    <Text style={styles.japaTapText}>Tap to count 📿</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Timer */}
            <View style={styles.timerCard}>
              <Text style={styles.timerClock}>{mm}:{ss}</Text>
              <View style={styles.timerBtnRow}>
                {!running ? (
                  <TouchableOpacity style={styles.timerBtnPrimary} onPress={() => setRunning(true)}>
                    <Text style={styles.timerBtnPrimaryText}>▶ Start</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.timerBtnSecondary} onPress={() => setRunning(false)}>
                    <Text style={styles.timerBtnSecondaryText}>⏸ Pause</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.timerBtnSecondary}
                  onPress={() => { setRunning(false); setRemaining(technique.durationSec); setJapaCount(0); }}
                >
                  <Text style={styles.timerBtnSecondaryText}>↺ Reset</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Instructions */}
            <Text style={styles.sectionLabel}>STEPS</Text>
            {technique.instructions.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <Text style={styles.stepBullet}>•</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  content: { paddingVertical: SPACING.lg, paddingBottom: 80 },
  header: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  title: { fontSize: 24, color: COLORS.cream, fontWeight: '600' },
  subtitle: { fontSize: 12, color: COLORS.muted, marginTop: 4 },

  // SOS block
  sosCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md,
    backgroundColor: 'rgba(255, 140, 66, 0.12)',
    borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.saffron,
  },
  sosLabel: { fontSize: 11, color: COLORS.saffron, fontWeight: '800', letterSpacing: 1.2, marginBottom: SPACING.sm },
  sosRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,140,66,0.15)',
  },
  sosName: { fontSize: 15, color: COLORS.cream, fontWeight: '600' },
  sosDur: { fontSize: 12, color: COLORS.saffron, fontWeight: '700' },

  filterRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: SPACING.md, marginBottom: SPACING.md,
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardBg,
  },
  filterChipActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  filterIcon: { fontSize: 13 },
  filterLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '600' },
  filterLabelActive: { color: COLORS.gold },

  listCard: {
    marginHorizontal: SPACING.md, marginBottom: 8,
    padding: SPACING.md, backgroundColor: COLORS.cardBg, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  listIcon: { fontSize: 28 },
  listName: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  listSub: { fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginTop: 2 },
  listDur: { fontSize: 11, color: COLORS.gold, fontWeight: '600', marginLeft: SPACING.sm },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.darkBg,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: SPACING.md, paddingBottom: SPACING.xl,
    maxHeight: '92%',
  },
  modalHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.md },
  modalClose: { color: COLORS.muted, fontSize: 18, padding: 4 },
  detailName: { fontSize: 22, color: COLORS.cream, fontWeight: '700' },
  detailSub: { fontSize: 12, color: COLORS.gold, fontStyle: 'italic', marginTop: 2 },

  // Breath visualizer
  breathArea: { alignItems: 'center', marginVertical: SPACING.lg },
  breathOrb: {
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(78, 168, 222, 0.4)',
    borderWidth: 2, borderColor: '#4ea8de',
    shadowColor: '#4ea8de', shadowOpacity: 0.8, shadowRadius: 30,
  },
  breathPhase: { position: 'absolute', top: 60, fontSize: 24, color: COLORS.cream, fontWeight: '700' },
  breathCount: { position: 'absolute', top: 100, fontSize: 38, color: COLORS.gold, fontWeight: '700' },

  // Mantra card
  mantraCard: {
    marginVertical: SPACING.md, padding: SPACING.md,
    backgroundColor: 'rgba(255, 184, 0, 0.08)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255, 184, 0, 0.3)',
  },
  mantraSans: { fontSize: 18, color: COLORS.cream, textAlign: 'center', lineHeight: 28 },
  mantraTrans: { fontSize: 13, color: COLORS.gold, textAlign: 'center', marginTop: 6, fontStyle: 'italic' },
  mantraMean: { fontSize: 12, color: COLORS.muted, textAlign: 'center', marginTop: 8, fontStyle: 'italic', lineHeight: 17 },
  japaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.md },
  japaCount: { fontSize: 16, color: COLORS.gold, fontWeight: '700' },
  japaTapBtn: {
    backgroundColor: COLORS.gold, paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: 8,
  },
  japaTapText: { color: COLORS.deep, fontWeight: '700', fontSize: 12 },

  // Timer
  timerCard: {
    backgroundColor: COLORS.cardBg, borderRadius: 12,
    padding: SPACING.md, alignItems: 'center', marginVertical: SPACING.md,
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.3)',
  },
  timerClock: { fontSize: 44, color: COLORS.gold, fontWeight: '700', letterSpacing: 2 },
  timerBtnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  timerBtnPrimary: { backgroundColor: COLORS.gold, paddingHorizontal: SPACING.lg, paddingVertical: 10, borderRadius: 8 },
  timerBtnPrimaryText: { color: COLORS.deep, fontWeight: '700' },
  timerBtnSecondary: { borderColor: COLORS.border, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: 10, borderRadius: 8 },
  timerBtnSecondaryText: { color: COLORS.cream, fontWeight: '600' },

  sectionLabel: { fontSize: 10, color: COLORS.muted, fontWeight: '700', letterSpacing: 1.5, marginTop: SPACING.md, marginBottom: SPACING.sm },
  stepRow: { flexDirection: 'row', paddingVertical: 4 },
  stepBullet: { color: COLORS.gold, fontSize: 14, marginRight: 6 },
  stepText: { flex: 1, fontSize: 13, color: COLORS.cream, lineHeight: 18 },
});
