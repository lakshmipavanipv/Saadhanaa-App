/**
 * YogaScreen — daily yoga sadhana hub.
 *
 *   • Surya Namaskar A (12-pose sequence) with audio-paced timing
 *   • Asanas library categorized by purpose (energy / calm / spine / hips)
 *   • Pranayama library (4-7-8, Nadi Shodhana, Bhramari, Kapalabhati)
 *   • "Today's recommendation" — picks 3 items based on time of day
 *
 * Each item has a description, duration, contraindications, and a
 * sit-with-timer button. No video — Hindu yoga tradition is described
 * in words first.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity, Modal,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { SoulsyncSessionBar } from '../soulsync/components/SoulsyncSessionBar';

type Category = 'morning' | 'energy' | 'calm' | 'spine' | 'hips' | 'pranayama';

interface YogaItem {
  id: string;
  name: string;
  sanskrit: string;
  category: Category;
  durationSec: number;
  benefit: string;
  steps: string[];
  contraindications?: string;
  /** For pranayama, the breath ratio (inhale-hold-exhale-hold seconds). */
  breathPattern?: { in: number; hold1: number; out: number; hold2: number };
}

const ITEMS: YogaItem[] = [
  // ── Surya Namaskar component poses ──
  {
    id: 'surya-namaskar',
    name: 'Surya Namaskar A',
    sanskrit: 'सूर्य नमस्कार',
    category: 'morning',
    durationSec: 300,
    benefit: 'Full-body warm-up. Salutes the rising sun. 12 poses flow into one breath cycle each — repeat 3–12 rounds.',
    steps: [
      '1. Pranamasana — stand tall, palms at heart',
      '2. Hasta Uttanasana — inhale, arms up & arch back',
      '3. Padahastasana — exhale, fold forward, palms to floor',
      '4. Ashwa Sanchalanasana — inhale, right leg back, knee down',
      '5. Dandasana — hold breath, plank position',
      '6. Ashtanga Namaskara — exhale, knees-chest-chin touch floor',
      '7. Bhujangasana — inhale, cobra (chest up)',
      '8. Adho Mukha Svanasana — exhale, downward dog',
      '9. Ashwa Sanchalanasana — inhale, right leg forward',
      '10. Padahastasana — exhale, fold forward',
      '11. Hasta Uttanasana — inhale, arms up',
      '12. Pranamasana — exhale, back to heart-palms',
    ],
    contraindications: 'Avoid in pregnancy after 1st trimester, high BP, hernia, severe back issues',
  },

  // ── Energy ──
  {
    id: 'tadasana',
    name: 'Mountain Pose',
    sanskrit: 'ताड़ासन (Tadasana)',
    category: 'energy',
    durationSec: 60,
    benefit: 'Foundational standing pose. Improves posture, awareness, and grounding. Perfect first thing in the morning.',
    steps: [
      'Stand with feet hip-width apart, weight even',
      'Press all four corners of each foot into the floor',
      'Engage thighs, lift kneecaps gently',
      'Lengthen tailbone down, lift crown of head up',
      'Roll shoulders back and down, palms facing forward',
      'Hold for 1 min, breathing steadily',
    ],
  },
  {
    id: 'virabhadrasana',
    name: 'Warrior II',
    sanskrit: 'वीरभद्रासन II (Virabhadrasana II)',
    category: 'energy',
    durationSec: 90,
    benefit: 'Builds leg strength, opens hips and chest, cultivates focus and inner fire (agni).',
    steps: [
      'Step feet ~4 ft apart',
      'Turn right foot 90° out, left foot slightly in',
      'Bend right knee over right ankle (90°)',
      'Extend arms parallel to floor, gaze over right fingertips',
      'Hold 45–60 sec, switch sides',
    ],
    contraindications: 'Knee injury — keep bend shallow',
  },

  // ── Calm ──
  {
    id: 'balasana',
    name: "Child's Pose",
    sanskrit: 'बालासन (Balasana)',
    category: 'calm',
    durationSec: 120,
    benefit: 'Deeply restorative. Calms the nervous system, gently stretches hips and spine. Use anytime as a reset.',
    steps: [
      'Kneel on the floor, big toes touching',
      'Sit back on heels, knees apart wider than hips',
      'Fold forward, forehead to mat',
      'Arms extended forward, palms down (or back along body)',
      'Breathe slowly into the back ribs',
      'Hold 1–3 min',
    ],
  },
  {
    id: 'shavasana',
    name: 'Corpse Pose',
    sanskrit: 'शवासन (Shavasana)',
    category: 'calm',
    durationSec: 600,
    benefit: 'The most important pose. Conscious total relaxation. Integrates the entire practice. Always end with at least 5 minutes.',
    steps: [
      'Lie flat on back, legs slightly apart, feet falling outward',
      'Arms by sides, palms up, fingers naturally curled',
      'Close eyes, soften the jaw and tongue',
      'Scan body from toes to crown, releasing each part',
      'Let breath become natural — observe without controlling',
      'Stay 5–15 min',
    ],
  },

  // ── Spine ──
  {
    id: 'bhujangasana',
    name: 'Cobra Pose',
    sanskrit: 'भुजङ्गासन (Bhujangasana)',
    category: 'spine',
    durationSec: 60,
    benefit: 'Strengthens spine and opens chest. Counters hours of sitting. Stimulates abdominal organs.',
    steps: [
      'Lie face-down, legs together, tops of feet on floor',
      'Place palms under shoulders, elbows bent close to body',
      'Inhale, press into palms, lift chest off floor',
      'Keep hips and pubic bone pressed down',
      'Shoulders rolled back, gaze forward (or slightly up)',
      'Hold 30–60 sec, breathing into back ribs',
    ],
    contraindications: 'Pregnancy, recent abdominal surgery, severe back injury',
  },

  // ── Hips ──
  {
    id: 'padmasana',
    name: 'Lotus Pose',
    sanskrit: 'पद्मासन (Padmasana)',
    category: 'hips',
    durationSec: 600,
    benefit: 'Classical meditation seat. Stabilizes the body for long japa / pranayama. Build up slowly — never force.',
    steps: [
      'Sit on floor with legs extended',
      'Bend right knee, place right foot on left thigh (sole up)',
      'Bend left knee, place left foot on right thigh',
      'Spine tall, hands on knees in chin/jnana mudra',
      'If too intense, sit in half lotus (only one foot up) or simple cross-legged',
      'Sit 5–15 min',
    ],
    contraindications: 'Knee/ankle injury — sit in Sukhasana (easy pose) or Vajrasana instead',
  },

  // ── Pranayama ──
  {
    id: 'nadi-shodhana',
    name: 'Alternate Nostril Breathing',
    sanskrit: 'नाडी शोधन (Nadi Shodhana)',
    category: 'pranayama',
    durationSec: 300,
    benefit: 'Balances left and right brain hemispheres. Calms anxiety, sharpens focus. The single best pranayama for daily practice.',
    steps: [
      'Sit comfortably, spine tall',
      'Use right hand: thumb to right nostril, ring finger to left',
      'Close right nostril, inhale through left (4 counts)',
      'Close left nostril, open right, exhale through right (4 counts)',
      'Inhale through right (4 counts)',
      'Close right, open left, exhale through left (4 counts)',
      'That is one round. Do 10 rounds.',
    ],
    breathPattern: { in: 4, hold1: 0, out: 4, hold2: 0 },
  },
  {
    id: 'four-seven-eight',
    name: '4-7-8 Breath',
    sanskrit: '4-7-8 Pranayama',
    category: 'pranayama',
    durationSec: 240,
    benefit: 'Powerful nervous-system reset. Inhale 4, hold 7, exhale 8. Within 3-4 cycles, anxiety drops noticeably. Use for sleep, panic, anger.',
    steps: [
      'Sit or lie comfortably',
      'Tip of tongue against ridge behind upper front teeth (entire practice)',
      'Exhale completely through mouth (whooshing sound)',
      'Close mouth, inhale through nose to count of 4',
      'Hold breath for count of 7',
      'Exhale through mouth (whoosh) for count of 8',
      'That is one cycle. Do 4 cycles.',
    ],
    breathPattern: { in: 4, hold1: 7, out: 8, hold2: 0 },
  },
  {
    id: 'bhramari',
    name: 'Bee Breath',
    sanskrit: 'भ्रामरी (Bhramari)',
    category: 'pranayama',
    durationSec: 240,
    benefit: 'Humming exhale creates internal vibration. Calms racing thoughts, eases tension headaches, lowers BP. Excellent before bed.',
    steps: [
      'Sit comfortably, eyes closed',
      'Plug ears with thumbs, index fingers above eyebrows, other fingers gently on closed eyes',
      'Inhale deeply through nose',
      'Exhale slowly while humming "mmmm" — feel the vibration in skull',
      'Do 5–10 rounds',
    ],
    breathPattern: { in: 4, hold1: 0, out: 8, hold2: 0 },
  },
  {
    id: 'kapalabhati',
    name: 'Skull-Shining Breath',
    sanskrit: 'कपालभाति (Kapalabhati)',
    category: 'pranayama',
    durationSec: 180,
    benefit: 'Active forced exhalations cleanse the lungs and energize. Builds prana. Best done in the morning.',
    steps: [
      'Sit upright, hands on knees',
      'Inhale halfway through nose',
      'Forcefully exhale through nose (belly snaps inward)',
      'Inhalation happens passively',
      'Do 30 quick exhalations, then deep inhale and hold',
      'Rest 30 sec, repeat 2 more rounds',
    ],
    contraindications: 'Pregnancy, high BP, heart disease, hernia, ulcers, menstruation',
  },
];

const CATEGORIES: { id: Category | 'all'; label: string; icon: string }[] = [
  { id: 'all',        label: 'All',         icon: '🧘' },
  { id: 'morning',    label: 'Morning',     icon: '🌅' },
  { id: 'energy',     label: 'Energy',      icon: '🔥' },
  { id: 'calm',       label: 'Calm',        icon: '🌊' },
  { id: 'spine',      label: 'Spine',       icon: '🦴' },
  { id: 'hips',       label: 'Hips',        icon: '🪷' },
  { id: 'pranayama',  label: 'Pranayama',   icon: '🌬️' },
];

const fmtSec = (s: number): string =>
  s >= 60 ? `${Math.round(s / 60)} min` : `${s} sec`;

export const YogaScreen = ({ navigation }: any) => {
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [selected, setSelected] = useState<YogaItem | null>(null);

  // Time-of-day recommendation
  const recommended = React.useMemo(() => {
    const h = new Date().getHours();
    if (h < 10)  return ITEMS.filter(i => ['morning', 'energy', 'pranayama'].includes(i.category)).slice(0, 3);
    if (h < 17)  return ITEMS.filter(i => ['energy', 'spine', 'hips'].includes(i.category)).slice(0, 3);
    return            ITEMS.filter(i => ['calm', 'pranayama'].includes(i.category)).slice(0, 3);
  }, []);

  const filtered = filter === 'all' ? ITEMS : ITEMS.filter(i => i.category === filter);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Yoga Sadhana</Text>
          <Text style={styles.subtitle}>Asanas + Pranayama for body and prana</Text>
        </View>

        {/* Soulsync — start before yoga to capture HRV / BPM changes */}
        <SoulsyncSessionBar
          practice="yoga"
          onViewInsights={() => navigation?.navigate?.('History')}
        />

        {/* Today's recommendation */}
        <View style={styles.recCard}>
          <Text style={styles.recLabel}>RECOMMENDED FOR THIS TIME OF DAY</Text>
          {recommended.map(i => (
            <TouchableOpacity key={i.id} style={styles.recRow} onPress={() => setSelected(i)}>
              <Text style={styles.recIcon}>{CATEGORIES.find(c => c.id === i.category)?.icon || '🧘'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.recName}>{i.name}</Text>
                <Text style={styles.recSanskrit}>{i.sanskrit}</Text>
              </View>
              <Text style={styles.recDur}>{fmtSec(i.durationSec)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Category filter */}
        <View style={styles.filterRow}>
          {CATEGORIES.map(c => (
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
        {filtered.map(i => (
          <TouchableOpacity key={i.id} style={styles.listCard} onPress={() => setSelected(i)}>
            <Text style={styles.listIcon}>{CATEGORIES.find(c => c.id === i.category)?.icon || '🧘'}</Text>
            <View style={{ flex: 1, marginLeft: SPACING.sm }}>
              <Text style={styles.listName}>{i.name}</Text>
              <Text style={styles.listSanskrit}>{i.sanskrit}</Text>
              <Text style={styles.listBenefit} numberOfLines={2}>{i.benefit}</Text>
            </View>
            <Text style={styles.listDur}>{fmtSec(i.durationSec)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Detail modal */}
      {selected && (
        <YogaDetailModal item={selected} onClose={() => setSelected(null)} />
      )}
    </View>
  );
};

// ─── Detail modal with timer ─────────────────────────────────────

const YogaDetailModal: React.FC<{ item: YogaItem; onClose: () => void }> = ({ item, onClose }) => {
  const [remaining, setRemaining] = useState(item.durationSec);
  const [running, setRunning] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailName}>{item.name}</Text>
                <Text style={styles.detailSanskrit}>{item.sanskrit}</Text>
              </View>
              <TouchableOpacity onPress={onClose}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>

            <Text style={styles.detailBenefit}>{item.benefit}</Text>

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
                  onPress={() => { setRunning(false); setRemaining(item.durationSec); }}
                >
                  <Text style={styles.timerBtnSecondaryText}>↺ Reset</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.sectionLabel}>STEPS</Text>
            {item.steps.map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <Text style={styles.stepBullet}>•</Text>
                <Text style={styles.stepText}>{s}</Text>
              </View>
            ))}

            {item.breathPattern && (
              <>
                <Text style={styles.sectionLabel}>BREATH PATTERN</Text>
                <Text style={styles.detailBenefit}>
                  Inhale {item.breathPattern.in}s
                  {item.breathPattern.hold1 > 0 && ` · hold ${item.breathPattern.hold1}s`}
                  {' · '}exhale {item.breathPattern.out}s
                  {item.breathPattern.hold2 > 0 && ` · hold ${item.breathPattern.hold2}s`}
                </Text>
              </>
            )}

            {item.contraindications && (
              <View style={styles.warnBox}>
                <Text style={styles.warnLabel}>⚠️ AVOID IF</Text>
                <Text style={styles.warnText}>{item.contraindications}</Text>
              </View>
            )}
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

  recCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, backgroundColor: COLORS.cardBg, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255, 184, 0, 0.25)',
  },
  recLabel: { fontSize: 10, color: COLORS.gold, fontWeight: '700', letterSpacing: 1.2, marginBottom: SPACING.sm },
  recRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  recIcon: { fontSize: 20, marginRight: SPACING.sm, width: 28 },
  recName: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  recSanskrit: { fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginTop: 1 },
  recDur: { fontSize: 11, color: COLORS.gold, fontWeight: '600' },

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
  listSanskrit: { fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginTop: 1 },
  listBenefit: { fontSize: 11, color: COLORS.cream, marginTop: 4, opacity: 0.85, lineHeight: 15 },
  listDur: { fontSize: 11, color: COLORS.gold, fontWeight: '600', marginLeft: SPACING.sm },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.darkBg,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: SPACING.md, paddingBottom: SPACING.xl,
    maxHeight: '88%',
  },
  modalHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.md },
  modalClose: { color: COLORS.muted, fontSize: 18, padding: 4 },
  detailName: { fontSize: 22, color: COLORS.cream, fontWeight: '700' },
  detailSanskrit: { fontSize: 13, color: COLORS.gold, fontStyle: 'italic', marginTop: 2 },
  detailBenefit: { fontSize: 13, color: COLORS.cream, lineHeight: 19, marginBottom: SPACING.md },

  timerCard: {
    backgroundColor: COLORS.cardBg, borderRadius: 12,
    padding: SPACING.md, alignItems: 'center', marginBottom: SPACING.md,
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

  warnBox: {
    marginTop: SPACING.md, padding: SPACING.sm,
    backgroundColor: 'rgba(255, 140, 66, 0.1)',
    borderRadius: 8, borderLeftWidth: 3, borderLeftColor: COLORS.saffron,
  },
  warnLabel: { fontSize: 10, color: COLORS.saffron, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  warnText: { fontSize: 12, color: COLORS.cream, lineHeight: 17 },
});
