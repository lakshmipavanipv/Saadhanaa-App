import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  FlatList,
  TextInput,
  Platform,
} from 'react-native';
import { useSadhana } from '../context';
import { todayStr, japasToSeconds, formatSadhanaTime } from '../utils';
import { COLORS, SPACING, FONT_SIZES } from '../theme';
import { useTheme } from '../ThemeContext';
import { Mala } from '../components/Mala';
import { RingSpinner } from '../components/RingSpinner';
import { PulseHighlight } from '../components/PulseHighlight';
import { SessionScorePopup } from '../soulsync/components/SessionScorePopup';
import { computeJapaEffect, JapaEffectSnapshot } from '../soulsync/analytics/JapaEffect';
import { DeityScreen } from './DeityScreen';
import { DeityIcon } from '../components/DeityIcon';
import { useSoulsyncSession } from '../soulsync/hooks/useSoulsyncSession';
// AddToPlanCta removed — Plan Your Wellbeing lives in the hamburger drawer.
import { TimePickerField } from '../components/TimePickerField';
import { ALL_CATALOG_DEITIES } from '../deityCatalog';
import { specialSadhanaRepo, SpecialTrigger, isPathEntry } from '../services/specialSadhanaRepo';
import { WeekSparkline } from '../components/WeekSparkline';
import { getDB } from '../soulsync/db/database';
import { DUMMY, withFallback } from '../services/dummyData';
import { PracticeStatsBox, BeforeAfterVitals } from '../components/PracticeStats';
import { LiveVitalsTrends } from '../soulsync/components/LiveVitalsTrends';
import {
  requestBlePermissions,
  scanForDevices,
  connectAndListen,
  ScannedDevice,
  CounterConnection,
} from '../services/ble';
import { JapaRingCounter, readSr16DeviceId, syncJapaHistory } from '../soulsync/ring';
import { useIsFocused } from '@react-navigation/native';

const BEADS = 108;

// ─── Sadhana Path Sheet ──────────────────────────────────────────
//
// Lets the user build a multi-step japa Sadhana Path with flexible
// scheduling: daily · specific weekdays · recurring tithi · specific
// calendar dates. Saves into specialSadhanaRepo so it lives alongside
// the Panchang Special Sadhanas (same trigger schema).

const TITHI_OPTIONS = [
  'Ekadashi', 'Pradosh', 'Purnima', 'Amavasya',
  'Chaturthi', 'Panchami', 'Shashti', 'Saptami',
  'Ashtami', 'Navami', 'Dashami', 'Dwadashi', 'Trayodashi', 'Chaturdashi',
];

const WEEKDAY_LABEL = ['S','M','T','W','T','F','S'];

const SadhanaPathSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}> = ({ visible, onClose, onSaved }) => {
  const { palette } = useTheme();
  const spSheetStyles = React.useMemo(() => makeSpSheetStyles(palette), [palette]);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<Array<{ deity: string; malas: number }>>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newDeity, setNewDeity] = useState('');
  const [newMalas, setNewMalas] = useState('1');
  const [triggerKind, setTriggerKind] = useState<'daily' | 'weekdays' | 'tithi' | 'dates'>('daily');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [tithi, setTithi] = useState('Ekadashi');
  const [dates, setDates] = useState('');

  const addStep = () => {
    const v = parseInt(newMalas, 10);
    if (!newDeity.trim() || !v || v <= 0) return;
    setSteps(p => [...p, { deity: newDeity.trim(), malas: v }]);
    setNewDeity(''); setNewMalas('1');
  };
  const removeStep = (idx: number) => setSteps(p => p.filter((_, i) => i !== idx));

  const save = async () => {
    if (!name.trim() || steps.length === 0) return;
    let trigger: SpecialTrigger;
    if (triggerKind === 'daily')      trigger = { kind: 'weekdays', days: [0,1,2,3,4,5,6] };
    else if (triggerKind === 'weekdays') trigger = { kind: 'weekdays', days: weekdays.length > 0 ? weekdays : [1] };
    else if (triggerKind === 'tithi')    trigger = { kind: 'tithi', tithi };
    else                                  trigger = { kind: 'dates', dates: dates.split(/[\s,]+/).filter(Boolean) };

    await specialSadhanaRepo.add({
      kind: 'path',
      name: name.trim(),
      practice: steps.map(s => `${s.deity} ${s.malas} mala`).join(' · '),
      durationMin: steps.reduce((s, x) => s + x.malas * 6, 0),  // ~6 min / mala
      trigger,
    });
    // Reset
    setName(''); setSteps([]); setWeekdays([]); setTriggerKind('daily'); setDates('');
    onSaved();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={spSheetStyles.overlay}>
        <View style={spSheetStyles.card}>
          <View style={spSheetStyles.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={spSheetStyles.title}>🛤  Sadhana Path</Text>
            <Text style={spSheetStyles.hint}>Sequence multiple deities · choose how often it recurs</Text>

            <Text style={spSheetStyles.label}>Path Name</Text>
            <TextInput
              style={spSheetStyles.input}
              value={name}
              onChangeText={setName}
              placeholder='e.g. "Morning Sadhana"  or  "Ekadashi Special"'
              placeholderTextColor={COLORS.muted}
            />

            <Text style={spSheetStyles.label}>STEPS · {steps.length}</Text>
            {steps.map((s, idx) => (
              <View key={idx} style={spSheetStyles.stepRow}>
                <Text style={spSheetStyles.stepIdx}>{idx + 1}.</Text>
                <Text style={spSheetStyles.stepName}>{s.deity}</Text>
                <Text style={spSheetStyles.stepVal}>{s.malas} mala</Text>
                <TouchableOpacity onPress={() => removeStep(idx)}>
                  <Text style={{ color: COLORS.error, paddingHorizontal: 6 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={spSheetStyles.pickBtn} onPress={() => setPickerOpen(v => !v)}>
              <Text style={spSheetStyles.pickBtnText}>🪷  Pick a deity from list  {pickerOpen ? '▴' : '▾'}</Text>
            </TouchableOpacity>
            {pickerOpen && (
              <ScrollView style={spSheetStyles.pickList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {ALL_CATALOG_DEITIES.map((d: any) => (
                  <TouchableOpacity
                    key={d.id}
                    style={spSheetStyles.pickRow}
                    onPress={() => { setNewDeity(d.name); setPickerOpen(false); }}
                  >
                    <Text style={{ fontSize: 20, marginRight: 8 }}>{d.icon || '🪷'}</Text>
                    <Text style={{ color: COLORS.cream, fontSize: 13 }}>{d.name}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={spSheetStyles.pickRow}
                  onPress={() => { setNewDeity(''); setPickerOpen(false); }}
                >
                  <Text style={{ fontSize: 20, marginRight: 8 }}>✍️</Text>
                  <Text style={{ color: COLORS.gold, fontSize: 13, fontWeight: '700' }}>Other / Custom</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
              <TextInput
                style={[spSheetStyles.input, { flex: 2 }]}
                value={newDeity}
                onChangeText={setNewDeity}
                placeholder="Deity / mantra"
                placeholderTextColor={COLORS.muted}
              />
              <TextInput
                style={[spSheetStyles.input, { flex: 0.8 }]}
                value={newMalas}
                onChangeText={setNewMalas}
                placeholder="1"
                placeholderTextColor={COLORS.muted}
                keyboardType="number-pad"
              />
              <TouchableOpacity style={spSheetStyles.addBtn} onPress={addStep}>
                <Text style={spSheetStyles.addBtnText}>＋</Text>
              </TouchableOpacity>
            </View>

            <Text style={spSheetStyles.label}>WHEN?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(['daily','weekdays','tithi','dates'] as const).map(k => (
                <TouchableOpacity
                  key={k}
                  style={[spSheetStyles.chip, triggerKind === k && spSheetStyles.chipActive]}
                  onPress={() => setTriggerKind(k)}
                >
                  <Text style={[spSheetStyles.chipText, triggerKind === k && spSheetStyles.chipTextActive]}>
                    {k === 'daily' ? '📅 Daily'
                      : k === 'weekdays' ? '📆 Weekdays'
                      : k === 'tithi' ? '🌗 Tithi'
                      : '🗓 Dates'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {triggerKind === 'weekdays' && (
              <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
                {WEEKDAY_LABEL.map((d, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[spSheetStyles.dayChip, weekdays.includes(i) && spSheetStyles.dayChipActive]}
                    onPress={() => setWeekdays(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i].sort())}
                  >
                    <Text style={[spSheetStyles.dayChipText, weekdays.includes(i) && spSheetStyles.dayChipTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {triggerKind === 'tithi' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {TITHI_OPTIONS.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[spSheetStyles.chip, tithi === t && spSheetStyles.chipActive]}
                      onPress={() => setTithi(t)}
                    >
                      <Text style={[spSheetStyles.chipText, tithi === t && spSheetStyles.chipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            {triggerKind === 'dates' && (
              <TextInput
                style={[spSheetStyles.input, { marginTop: 8 }]}
                value={dates}
                onChangeText={setDates}
                placeholder="YYYY-MM-DD, YYYY-MM-DD ..."
                placeholderTextColor={COLORS.muted}
              />
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: SPACING.md }}>
              <TouchableOpacity style={spSheetStyles.cancelBtn} onPress={onClose}>
                <Text style={spSheetStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={spSheetStyles.saveBtn} onPress={save}>
                <Text style={spSheetStyles.saveText}>Save Sadhana Path</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const makeSpSheetStyles = (C: typeof COLORS) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  card: { backgroundColor: C.darkBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.md, paddingBottom: SPACING.xl, maxHeight: '92%' },
  handle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.sm },
  title: { color: C.cream, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  hint: { color: C.muted, fontSize: 12, fontStyle: 'italic', marginBottom: SPACING.md },
  label: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: C.cardBg, borderRadius: 10, padding: SPACING.sm, color: C.cream, fontSize: 14, borderWidth: 1, borderColor: C.border },

  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  stepIdx: { color: C.gold, width: 22, fontWeight: '700' },
  stepName: { flex: 1, color: C.cream, fontSize: 13 },
  stepVal: { color: C.gold, fontSize: 12, fontWeight: '700', marginRight: 4 },

  pickBtn: { paddingVertical: 10, paddingHorizontal: 12, backgroundColor: C.cardBg, borderRadius: 10, borderWidth: 1, borderColor: C.gold, marginTop: 8 },
  pickBtnText: { color: C.gold, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  pickList: { maxHeight: 200, backgroundColor: C.deep, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginTop: 4, paddingHorizontal: SPACING.sm },
  pickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },

  addBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: C.deep, fontSize: 20, fontWeight: '800' },

  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.cardBg },
  chipActive: { borderColor: C.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  chipText: { color: C.muted, fontSize: 11, fontWeight: '700' },
  chipTextActive: { color: C.gold },

  dayChip: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.cardBg },
  dayChipActive: { borderColor: C.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  dayChipText: { color: C.muted, fontSize: 12, fontWeight: '700' },
  dayChipTextActive: { color: C.gold },

  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelText: { color: C.cream, fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: C.gold, alignItems: 'center' },
  saveText: { color: C.deep, fontWeight: '800' },
});
const spSheetStyles = makeSpSheetStyles(COLORS);

// ─── Sadhana Depth Score (clickable card) ────────────────────────
//
// Reads today's avg depth_score from session_spiritual. Tap → opens a
// trend modal showing the last 14 days as bars so the user can see how
// their japa effect is trending across the week.

const SadhanaDepthScore: React.FC<{ onOpenTrend: () => void }> = ({ onOpenTrend }) => {
  const { palette } = useTheme();
  const depthStyles = React.useMemo(() => makeDepthStyles(palette), [palette]);
  const [todayDepth, setTodayDepth] = useState<number | null>(null);
  const [delta7, setDelta7] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDB();
        const today = todayStr();
        const ds = today + 'T00:00:00', de = today + 'T23:59:59';
        const t = await db.getFirstAsync<{ v: number | null }>(
          `SELECT AVG(depth_score) AS v FROM session_spiritual
           WHERE start_time BETWEEN ? AND ?`, [ds, de]
        );
        if (t?.v != null) setTodayDepth(Math.round(t.v * 10) / 10);
        // 7-day average for trend context
        const week = await db.getFirstAsync<{ v: number | null }>(
          `SELECT AVG(depth_score) AS v FROM session_spiritual
           WHERE start_time >= datetime('now','-7 days')`
        );
        if (week?.v != null && t?.v != null) {
          setDelta7(Math.round((t.v - week.v) * 10) / 10);
        }
      } catch { /* DB not ready */ }
    })();
  }, []);

  // Fallback for first-use UX
  const displayDepth = withFallback(todayDepth, DUMMY.depthToday);
  const displayDelta = delta7 ?? 0.4; // small positive delta as default

  return (
    <TouchableOpacity style={depthStyles.card} onPress={onOpenTrend} activeOpacity={0.75}>
      <View style={{ flex: 1 }}>
        <Text style={depthStyles.label}>SADHANA DEPTH SCORE · TODAY</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={depthStyles.value}>{displayDepth}</Text>
          <Text style={depthStyles.outOf}> / 10</Text>
          {(delta7 != null || true) && (
            <Text style={[
              depthStyles.delta,
              { color: displayDelta >= 0 ? '#3ddc84' : '#FF8C42' },
            ]}>
              {displayDelta > 0 ? '↑ +' : displayDelta < 0 ? '↓ ' : '↔ '}{Math.abs(displayDelta)} vs 7-day avg
            </Text>
          )}
        </View>
        <Text style={depthStyles.hint}>Tap to view 14-day depth trend ›</Text>
      </View>
      <Text style={{ fontSize: 28 }}>🪷</Text>
    </TouchableOpacity>
  );
};

const makeDepthStyles = (C: typeof COLORS) => StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, backgroundColor: C.cardBg,
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(212,160,23,0.35)',
  },
  label: { fontSize: 10, color: C.muted, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
  value: { fontSize: 28, color: C.gold, fontWeight: '800', lineHeight: 30 },
  outOf: { fontSize: 14, color: C.muted, fontWeight: '500' },
  delta: { fontSize: 11, fontWeight: '700', marginLeft: 8 },
  hint: { fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 4 },
});
const depthStyles = makeDepthStyles(COLORS);

// ─── Sadhana Vitals Compare (live, during active session) ────────

const SadhanaVitalsCompare: React.FC<{ liveBpm: number | null; liveRmssd: number | null }> = ({ liveBpm, liveRmssd }) => {
  const { palette } = useTheme();
  const vitalStyles = React.useMemo(() => makeVitalStyles(palette), [palette]);
  const [baseline, setBaseline] = useState<{ bpm: number; hrv: number; spo2: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDB();
        const today = todayStr();
        const row = await db.getFirstAsync<{ bpm: number | null; hrv: number | null; spo2: number | null }>(
          `SELECT AVG(ambient_bpm) AS bpm, AVG(ambient_rmssd) AS hrv, AVG(spo2) AS spo2
           FROM ambient_baseline WHERE timestamp BETWEEN ? AND ?`,
          [today + 'T00:00:00', today + 'T23:59:59']
        );
        if (row?.bpm != null) {
          setBaseline({
            bpm: Math.round(row.bpm),
            hrv: Math.round(row.hrv ?? 0),
            spo2: Math.round((row.spo2 ?? 0) * 10) / 10,
          });
        }
      } catch { /* no data */ }
    })();
  }, []);

  const VRow = ({ icon, label, before, during, unit, higherIsBetter }: {
    icon: string; label: string;
    before: number | null; during: number | null;
    unit: string; higherIsBetter: boolean;
  }) => {
    const has = before != null && during != null;
    const d = has ? (during - before) : 0;
    const good = higherIsBetter ? d > 0 : d < 0;
    return (
      <View style={vitalStyles.row}>
        <Text style={vitalStyles.icon}>{icon}</Text>
        <Text style={vitalStyles.label}>{label}</Text>
        <Text style={vitalStyles.num}>{before ?? '—'}</Text>
        <Text style={vitalStyles.arrow}>→</Text>
        <Text style={[vitalStyles.num, has && { color: COLORS.cream, fontWeight: '700' }]}>
          {during ?? '—'}
        </Text>
        {has ? (
          <Text style={[vitalStyles.delta, { color: good ? '#3ddc84' : '#FF8C42' }]}>
            {d > 0 ? '+' : ''}{d} {unit}
          </Text>
        ) : <Text style={vitalStyles.delta}>—</Text>}
      </View>
    );
  };

  // Fallback baseline + during values when no real data
  const fbBaseline = baseline ?? { bpm: DUMMY.ambientToday.bpm, hrv: DUMMY.ambientToday.rmssd, spo2: DUMMY.ambientToday.spo2 };
  const fbLiveBpm   = withFallback(liveBpm,   DUMMY.sessionAverages.bpm);
  const fbLiveRmssd = withFallback(liveRmssd, DUMMY.sessionAverages.rmssd);
  const fbLiveSpo2  = DUMMY.sessionAverages.spo2;

  return (
    <View style={vitalStyles.card}>
      <Text style={vitalStyles.title}>VITALS · BASELINE vs SADHANA (LIVE)</Text>
      <VRow icon="❤️" label="BPM"           before={fbBaseline.bpm}  during={fbLiveBpm}   unit="bpm" higherIsBetter={false} />
      <VRow icon="〰️" label="HRV (RMSSD)"   before={fbBaseline.hrv}  during={fbLiveRmssd} unit="ms"  higherIsBetter={true} />
      <VRow icon="🫁" label="SpO₂"          before={fbBaseline.spo2} during={fbLiveSpo2}  unit="%"   higherIsBetter={true} />
      <Text style={vitalStyles.hint}>
        Lower BPM + higher HRV during practice = the parasympathetic
        gate is open. Watch it shift in real time as you chant.
      </Text>
    </View>
  );
};

const makeVitalStyles = (C: typeof COLORS) => StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(212,160,23,0.20)',
  },
  title: { fontSize: 10, color: C.muted, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  icon: { fontSize: 16, width: 24 },
  label: { flex: 1, color: C.cream, fontSize: 12, fontWeight: '600' },
  num: { color: C.muted, fontSize: 13, width: 40, textAlign: 'right' },
  arrow: { color: C.muted, fontSize: 12, paddingHorizontal: 4 },
  delta: { fontSize: 11, fontWeight: '700', width: 64, textAlign: 'right' },
  hint: { fontSize: 10, color: C.muted, fontStyle: 'italic', marginTop: 6, lineHeight: 14 },
});
const vitalStyles = makeVitalStyles(COLORS);

// ─── Depth Score Trend Modal ─────────────────────────────────────

const DepthTrendModal: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => {
  const { palette } = useTheme();
  const depthTrendStyles = React.useMemo(() => makeDepthTrendStyles(palette), [palette]);
  const [series, setSeries] = useState<number[]>([0,0,0,0,0,0,0]);
  const [labels, setLabels] = useState<string[]>(['','','','','','','']);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const db = await getDB();
        const vals: number[] = [];
        const lbls: string[] = [];
        for (let i = 13; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000);
          const ds = d.toISOString().slice(0, 10);
          const r = await db.getFirstAsync<{ v: number | null }>(
            `SELECT AVG(depth_score) AS v FROM session_spiritual
             WHERE start_time BETWEEN ? AND ?`,
            [ds + 'T00:00:00', ds + 'T23:59:59']
          );
          vals.push(r?.v != null ? Math.round(r.v * 10) / 10 : 0);
          lbls.push(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()].charAt(0));
        }
        setSeries(vals);
        setLabels(lbls);
      } catch { /* no data */ }
    })();
  }, [visible]);

  const peak = Math.max(0, ...series);
  const avg = series.filter(x => x > 0).reduce((s, x) => s + x, 0) /
              Math.max(1, series.filter(x => x > 0).length);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={depthTrendStyles.overlay}>
        <View style={depthTrendStyles.card}>
          <View style={depthTrendStyles.handle} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={depthTrendStyles.title}>🪷 Sadhana Depth · 14-day trend</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: COLORS.muted, fontSize: 20 }}>✕</Text></TouchableOpacity>
          </View>
          <Text style={depthTrendStyles.subtitle}>
            Peak {peak ? peak.toFixed(1) : '—'} · Avg {avg ? avg.toFixed(1) : '—'} / 10
          </Text>
          <View style={{ marginTop: SPACING.md }}>
            <WeekSparkline values={series.slice(7)} labels={labels.slice(7)} height={70} showPeak />
          </View>
          <Text style={depthTrendStyles.subSection}>Previous 7 days</Text>
          <WeekSparkline values={series.slice(0, 7)} labels={labels.slice(0, 7)} height={56} />
          <Text style={depthTrendStyles.helper}>
            The depth score blends your in-session BPM drop, HRV gain,
            session duration and consistency. Higher = your body went
            deeper into the parasympathetic state during japa.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const makeDepthTrendStyles = (C: typeof COLORS) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  card: { backgroundColor: C.darkBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.md, paddingBottom: SPACING.xl },
  handle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.sm },
  title: { color: C.cream, fontSize: 18, fontWeight: '800', flex: 1 },
  subtitle: { color: C.gold, fontSize: 12, fontWeight: '700', marginTop: 4 },
  subSection: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: SPACING.md, marginBottom: 4 },
  helper: { color: C.muted, fontSize: 11, fontStyle: 'italic', marginTop: SPACING.md, lineHeight: 15 },
});
const depthTrendStyles = makeDepthTrendStyles(COLORS);

export const JapaScreen = ({ navigation, onOpenSandhya }: any) => {
  const { palette } = useTheme();
  const styles = React.useMemo(() => makeStyles(palette), [palette]);
  const depthStyles = React.useMemo(() => makeDepthStyles(palette), [palette]);
  const vitalStyles = React.useMemo(() => makeVitalStyles(palette), [palette]);
  const spSheetStyles = React.useMemo(() => makeSpSheetStyles(palette), [palette]);
  const depthTrendStyles = React.useMemo(() => makeDepthTrendStyles(palette), [palette]);
  const {
    selectedDeity, setSelectedDeity, deities, setDeities, saveSession, showToast,
    deityProgress, updateProgress, history,
    setBleConnected, registerBleHandlers,
  } = useSadhana();

  // Inline reminder-time picker for the deity list
  const [pickingDeityId, setPickingDeityId] = useState<string | null>(null);
  // Deities breakdown collapsed by default — tap header to expand.
  const [deitiesExpanded, setDeitiesExpanded] = useState(false);

  // ── Lifetime totals (across all history + in-progress) ───────────
  const lifetimeJapas = React.useMemo(() => {
    const h = history.reduce((s, x) => s + x.japas, 0);
    const ip = Object.values(deityProgress).reduce((s, p) => s + (p.count || 0), 0);
    return h + ip;
  }, [history, deityProgress]);
  const lifetimeMalas = React.useMemo(
    () => history.reduce((s, x) => s + x.malas, 0),
    [history]
  );
  const [count, setCount] = useState(0);
  const [malas, setMalas] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [popBead, setPopBead] = useState(-1);

  // ── Soulsync ring-telemetry session (mock until hardware arrives) ──
  const soulsync = useSoulsyncSession();

  // ── Active Sadhana Path tracking (auto-advance through steps) ──
  // When the user picks a Sadhana Path (Ganapathi 1 mala → Guru 1 mala →
  // Ishta 5 malas …), we remember the current step index and the path
  // record. The tap() handler below checks: after a mala completes, if
  // the step's mala goal has been reached, auto-advance to the NEXT
  // step's deity and continue counting toward the overall path goal.
  const [activePath, setActivePath] = useState<any | null>(null);          // a SpecialSadhana row
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [activeStepMalas, setActiveStepMalas] = useState<number>(0);       // malas done at current step

  // Sadhana Depth Score for the top stats box (live from JapaEffect).
  // Falls back to the dummy DUMMY.soulDepthScore until the user has
  // logged a session today (≈ same pattern as Yoga / Meditation).
  const [japaDepthScore, setJapaDepthScore] = useState<number>(DUMMY.soulDepthScore);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await computeJapaEffect();
        if (!cancelled && snap?.score != null) setJapaDepthScore(snap.score);
      } catch { /* keep dummy */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── BLE state ──
  const [showBleModal, setShowBleModal] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connection, setConnection] = useState<CounterConnection | null>(null);
  const stopScanRef = useRef<(() => void) | null>(null);
  const tapRef = useRef<() => void>(() => {});

  // Debounce BLE taps so a single button press doesn't double-count
  const lastTapAtRef = useRef(0);

  // Mirror connection status into context so Settings can show pair state
  useEffect(() => { setBleConnected(!!connection); }, [connection, setBleConnected]);

  // When deity changes, load that deity's saved progress
  useEffect(() => {
    if (!selectedDeity) {
      setCount(0);
      setMalas(0);
      return;
    }
    const saved = deityProgress[selectedDeity.id];
    setCount(saved?.count ?? 0);
    setMalas(saved?.malas ?? 0);
  }, [selectedDeity?.id]);
  const [showManual, setShowManual] = useState(false);
  const [manualMalas, setManualMalas] = useState('');
  const [manualJapas, setManualJapas] = useState('');
  const [manualDate, setManualDate] = useState(todayStr());

  const submitManual = () => {
    const mNum = parseInt(manualMalas, 10) || 0;
    const jNum = parseInt(manualJapas, 10) || 0;
    if (mNum === 0 && jNum === 0) {
      showToast('Enter malas or japas count');
      return;
    }
    if (!selectedDeity) {
      showToast('Select a deity first');
      return;
    }
    const totalJapas = mNum * 108 + jNum;
    const totalMalas = Math.round((totalJapas / 108) * 100) / 100;
    saveSession({
      deity: selectedDeity.name,
      deityId: selectedDeity.id,
      malas: Math.floor(totalJapas / 108) || (totalJapas > 0 ? 1 : 0),
      japas: totalJapas,
      date: manualDate,
    });
    setManualMalas('');
    setManualJapas('');
    setShowManual(false);
    showToast(`Logged ${totalMalas} malas / ${totalJapas} japas`);
  };

  // ── Guided hints around the Soulsync button ────────────────────
  // 'start' shown after first bead tap when Soulsync is OFF
  // 'stop'  shown after a mala completes while Soulsync is ON
  const [hintMode, setHintMode] = useState<'none' | 'start' | 'stop'>('none');

  // Post-session score modal state
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [sessionSnap, setSessionSnap] = useState<JapaEffectSnapshot | null>(null);
  // Deity manager modal (replaces removed Deities tab)
  const [showDeityManager, setShowDeityManager] = useState(false);
  // "+ Sadhana ▾" action sheet (deity / sandhya / sadhana path)
  const [showSadhanaMenu, setShowSadhanaMenu] = useState(false);
  // Sadhana Path builder sheet (tithi/dates aware)
  const [showSadhanaPathSheet, setShowSadhanaPathSheet] = useState(false);
  // Unified Sadhana picker — replaces the standalone deity dropdown.
  const [showSadhanaPicker, setShowSadhanaPicker] = useState(false);
  // Sadhana Depth Score trend modal
  const [showDepthTrend, setShowDepthTrend] = useState(false);
  // Loaded sadhana paths (cached when the picker opens)
  const [sadhanaPaths, setSadhanaPaths] = useState<any[]>([]);
  useEffect(() => {
    if (showSadhanaPicker) {
      specialSadhanaRepo.list().then((all) => setSadhanaPaths(all.filter(isPathEntry)));
    }
  }, [showSadhanaPicker]);

  const tap = useCallback(() => {
    if (!selectedDeity) {
      showToast('Please select a deity first!');
      return;
    }
    setPopBead(count);
    setTimeout(() => setPopBead(-1), 280);

    // ── Hint: first bead of an unrecorded session ──
    if (count === 0 && !soulsync.state.active) {
      setHintMode('start');
      setTimeout(() => setHintMode(m => m === 'start' ? 'none' : m), 6000);
    }

    const next = count + 1;
    if (next >= BEADS) {
      // Auto-save on mala completion
      saveSession({
        deity: selectedDeity.name,
        deityId: selectedDeity.id,
        malas: 1,
        japas: 108,
        date: todayStr(),
      });
      const newMalas = malas + 1;
      setMalas(newMalas);
      setCount(0);
      updateProgress(selectedDeity.id, 0, newMalas);
      // Soulsync: increment mala count on the active session row
      if (soulsync.state.active) {
        soulsync.recordMala();
        // ── Hint: mala done, suggest stopping to see score ──
        setHintMode('stop');
        setTimeout(() => setHintMode(m => m === 'stop' ? 'none' : m), 8000);
      }
      showToast(`🪷 1 mala saved for ${selectedDeity.name}`);

      // ── Sadhana Path auto-advance ──
      // If a Sadhana Path is active, check whether the current step's
      // mala goal has been reached. If yes, advance to the next step
      // and switch selectedDeity automatically. The user keeps tapping
      // beads while the deity (and the goal at the back) silently rolls
      // over. When the final step finishes, we surface a completion
      // toast and clear the active path.
      if (activePath?.steps?.length) {
        const step = activePath.steps[activeStepIndex];
        const goalMalas = step?.malas ?? 1;
        const stepDoneMalas = activeStepMalas + 1;
        if (stepDoneMalas >= goalMalas) {
          // Advance to next step
          const nextIdx = activeStepIndex + 1;
          if (nextIdx < activePath.steps.length) {
            const nextStep = activePath.steps[nextIdx];
            // Resolve the deity for the next step from the catalog
            const nextDeity = deities.find(
              d => d.name.toLowerCase() === String(nextStep.deity).toLowerCase()
            );
            if (nextDeity) {
              setSelectedDeity(nextDeity);
              showToast(
                `🪷 Step ${activeStepIndex + 1} done — moving to ${nextDeity.name}`
              );
            }
            setActiveStepIndex(nextIdx);
            setActiveStepMalas(0);
          } else {
            // Final step complete — clear path
            showToast(`✨ Sadhana Path "${activePath.name}" complete!`);
            setActivePath(null);
            setActiveStepIndex(0);
            setActiveStepMalas(0);
          }
        } else {
          setActiveStepMalas(stepDoneMalas);
        }
      }
    } else {
      setCount(next);
      updateProgress(selectedDeity.id, next, malas);
    }
  }, [selectedDeity, saveSession, showToast, count, malas, updateProgress, soulsync,
       activePath, activeStepIndex, activeStepMalas, deities, setSelectedDeity]);

  // ── Intercept Soulsync toggle: when stopping, compute score + popup ──
  const handleSoulsyncToggle = useCallback(async () => {
    if (soulsync.state.active) {
      await soulsync.stop();
      setHintMode('none');
      // Wait briefly so the DB finalisation (avg_bpm, end_time) lands
      await new Promise(r => setTimeout(r, 600));
      try {
        const snap = await computeJapaEffect();
        setSessionSnap(snap);
        setShowScoreModal(true);
      } catch (e) {
        console.warn('[JapaScreen] score popup failed', e);
      }
    } else {
      await soulsync.start();
      setHintMode('none');
    }
  }, [soulsync]);

  const reset = () => {
    setCount(0);
    setMalas(0);
    if (selectedDeity) updateProgress(selectedDeity.id, 0, 0);
  };

  // Keep tapRef in sync so BLE callbacks always call the latest closure
  useEffect(() => {
    tapRef.current = tap;
  }, [tap]);

  // Cleanup BLE on unmount
  useEffect(() => {
    return () => {
      stopScanRef.current?.();
      connection?.disconnect();
    };
  }, []);

  // ── SR16 smart-ring physical tap → japa increment ──────────────────
  //
  // If the user paired an SR16 in Ring Debug, we spin up a background
  // JapaRingCounter for this screen's lifetime. Every physical bead-touch
  // on the ring fires a BLE frame, which we translate to a tap on the
  // currently-selected deity. Auto-reconnects if the link drops between
  // taps (the ring's supervision timeout kicks in after ~7 s of silence).
  const sr16CounterRef = useRef<JapaRingCounter | null>(null);
  const [sr16Status, setSr16Status] = useState<'off' | 'connecting' | 'connected'>('off');
  // Independent debug counter: every physical tap increments this even when
  // selectedDeity is null and tap() early-returns. Lets the user visually
  // confirm the ring is actually pushing frames to the Japa flow.
  const [sr16Events, setSr16Events] = useState(0);
  const [sr16LastError, setSr16LastError] = useState<string | null>(null);
  const isFocused = useIsFocused();

  // Factored so both the focus effect and the manual reconnect button can
  // call it. Returns a cancel token to allow abort if the tab blurs mid-connect.
  const startSr16Counter = useCallback(async (): Promise<'ok' | 'no-pair' | 'error'> => {
    if (sr16CounterRef.current) return 'ok';
    const paired = await readSr16DeviceId();
    if (!paired) { setSr16Status('off'); setSr16LastError('No ring paired — pair from Bluetooth screen first.'); return 'no-pair'; }
    setSr16Status('connecting');
    setSr16LastError(null);
    try {
      const c = await JapaRingCounter.start({
        onTap: () => {
          // Debug: always count the frame, even if the main tap handler skips it.
          setSr16Events((n) => n + 1);
          tapRef.current?.();
        },
        onConnected: () => { setSr16Status('connected'); setSr16LastError(null); },
        onDisconnected: () => setSr16Status('connecting'),
        onError: (e) => { setSr16Status('off'); setSr16LastError(e.message); },
      });
      sr16CounterRef.current = c;
      return 'ok';
    } catch (e) {
      setSr16Status('off');
      setSr16LastError((e as Error).message);
      return 'error';
    }
  }, []);

  // Try to bring up the JapaRingCounter every time the tab comes into focus
  // AND we don't already have one running. This handles two edge cases the
  // previous mount-only useEffect missed:
  //   1) User paired the ring AFTER first opening Japa — we now retry on
  //      the next focus so the fresh sr16_last_device is picked up.
  //   2) Ring Debug (modal) held the sole GATT connection last time we tried;
  //      when the user closes Debug and comes back to Japa, we retry.
  useEffect(() => {
    if (!isFocused) return;
    void startSr16Counter();
  }, [isFocused, startSr16Counter]);

  const reconnectSr16 = useCallback(async () => {
    // Force teardown + reconnect. Used by the status pill tap.
    if (sr16CounterRef.current) {
      await sr16CounterRef.current.stop().catch(() => {});
      sr16CounterRef.current = null;
    }
    setSr16Events(0);
    const r = await startSr16Counter();
    if (r === 'error') {
      showToast('Ring connect failed — is Ring Debug still open? Close it and retry.');
    } else if (r === 'no-pair') {
      showToast('No ring paired yet.');
    }
  }, [startSr16Counter, showToast]);

  // Full teardown only on screen unmount (not on tab blur) so background taps
  // keep counting while the user is on other tabs.
  useEffect(() => {
    return () => {
      sr16CounterRef.current?.stop();
      sr16CounterRef.current = null;
    };
  }, []);

  // ── Push selected deity name to ring OLED ──────────────────────────
  //
  // Whenever the user picks a different deity in the japa tab, send the
  // first two letters of the name to the ring so the display mirrors the
  // app's current context. Fire-and-forget; failures silently swallowed
  // (OLED support depends on SR16 firmware variant).
  useEffect(() => {
    if (!selectedDeity?.name) return;
    void sr16CounterRef.current?.displayDeityLabel(selectedDeity.name, 2);
  }, [selectedDeity?.name, sr16Status]);

  // ── SR16 historical tasbih reconcile ───────────────────────────────
  //
  // On tab open, pull the ring's stored japa counter and attribute any
  // taps since the last watermark to the currently-selected deity. This
  // catches physical taps that happened while the phone wasn't paired or
  // the Japa tab wasn't open (the live JapaRingCounter above only counts
  // taps that arrive while it's actively connected).
  //
  // Runs OUTSIDE the live counter — it opens its own short-lived BLE
  // session, reads once, disconnects. Watermark is persisted so we only
  // ever attribute NEW ring counts to the app, never phantom back-fill.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const paired = await readSr16DeviceId();
      if (!paired || cancelled) return;
      // Small delay so the live-counter connect doesn't race with us on
      // the same GATT link.
      await new Promise(r => setTimeout(r, 1500));
      if (cancelled) return;
      const res = await syncJapaHistory();
      if (cancelled) return;
      if (!res.delta || res.delta <= 0) return;
      // Cap the batch so a wildly stale watermark doesn't fire thousands
      // of taps at once — 10 malas (1080 beads) is a very generous cap.
      const applied = Math.min(res.delta, 1080);
      for (let i = 0; i < applied; i++) tapRef.current?.();
      showToast(
        applied === res.delta
          ? `📿 ${applied} ring tap${applied === 1 ? '' : 's'} synced`
          : `📿 ${applied} synced (${res.delta - applied} skipped, cap)`
      );
    })();
    return () => { cancelled = true; };
  }, []);

  // Register pair / disconnect handlers in context so SettingsScreen can invoke them.
  useEffect(() => {
    registerBleHandlers({
      pair: () => { handleBlePress(); },
      disconnect: () => {
        if (connection) {
          connection.disconnect();
          setConnection(null);
          showToast('Counter disconnected');
        }
      },
    });
  }, [connection, registerBleHandlers]);

  const handleBlePress = async () => {
    if (connection) {
      // Disconnect
      await connection.disconnect();
      setConnection(null);
      showToast('Counter disconnected');
      return;
    }
    if (Platform.OS === 'web') {
      showToast('BLE only works on the installed Android APK');
      return;
    }
    const granted = await requestBlePermissions();
    if (!granted) {
      showToast('Bluetooth permission denied');
      return;
    }
    setScannedDevices([]);
    setShowBleModal(true);
    setScanning(true);
    stopScanRef.current = scanForDevices(
      d => setScannedDevices(p => [...p, d]),
      err => {
        showToast(err);
        setScanning(false);
      },
      15000
    );
    setTimeout(() => setScanning(false), 15000);
  };

  const handleConnect = async (deviceId: string, deviceName: string) => {
    stopScanRef.current?.();
    setScanning(false);
    setConnectingId(deviceId);
    try {
      const conn = await connectAndListen(
        deviceId,
        () => {
          // Debounce 300ms — physical button bounce protection
          const now = Date.now();
          if (now - lastTapAtRef.current < 300) return;
          lastTapAtRef.current = now;
          tapRef.current();
        },
        () => {
          setConnection(null);
          showToast('Counter disconnected');
        }
      );
      setConnection(conn);
      setShowBleModal(false);
      showToast(`✓ Connected to ${deviceName}`);
    } catch (e: any) {
      showToast(`Connection failed: ${e?.message || 'unknown'}`);
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.deep }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ─── Header (title only — lifetime pill removed in v43) ─── */}
        <View style={styles.header}>
          <Text style={styles.title}>Japa Counter</Text>
          <Text style={styles.subtitle}>1 Mala = 108 Japas</Text>
        </View>

        {/* ─── Top stats — same pattern as Yoga / Meditation:
              • Time today + japa count today
              • Sadhana Depth Score with horizontal dashed bar ─── */}
        {(() => {
          const today = todayStr();
          const todayHistoryJapas = history
            .filter(h => h.date === today)
            .reduce((s, h) => s + h.japas, 0);
          const todayJapas = todayHistoryJapas + (malas * 108 + count);
          const todaySec = japasToSeconds(todayJapas);
          const todayMin = Math.round(todaySec / 60);
          return (
            <PracticeStatsBox
              practice="japa"
              minutesToday={withFallback(todayMin, 12)}
              goalMinutes={20}
              depthScore={japaDepthScore}
              subMetric={{ label: 'JAPA COUNT TODAY', value: todayJapas.toLocaleString() }}
              compact
              onOpenTrend={() => setShowDepthTrend(true)}
            />
          );
        })()}

        {/* Plan CTA removed — Plan Your Wellbeing is in the ☰ drawer. */}

        {/* Deities breakdown moved to the very bottom of this screen in v43 —
            shown below the Soul Sync trends so it doesn't compete with the
            primary "Pick a Sadhana" entry point. */}

        {/* ─── Quick deity strip ───
             Persistent horizontal row of the user's added deities with
             their live counts. Tap a chip to switch — ring taps will then
             count against that deity. Long-press cycles to the next one
             (mimics the on-ring counter-mode deity-selector we can't build
             without custom firmware). */}
        {deities.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: SPACING.md, marginBottom: SPACING.sm }}
            contentContainerStyle={{ paddingRight: SPACING.md }}
          >
            {deities.map((d) => {
              const prog = deityProgress[d.id] ?? { count: 0, malas: 0 };
              const isSelected = selectedDeity?.id === d.id;
              return (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => setSelectedDeity(d)}
                  onLongPress={() => {
                    // Cycle to next deity in the list.
                    const idx = deities.findIndex((x) => x.id === d.id);
                    const next = deities[(idx + 1) % deities.length];
                    if (next) setSelectedDeity(next);
                  }}
                  style={{
                    marginRight: SPACING.sm,
                    paddingVertical: SPACING.sm,
                    paddingHorizontal: SPACING.md,
                    borderRadius: 20,
                    borderWidth: 1.5,
                    borderColor: isSelected ? COLORS.gold : COLORS.border,
                    backgroundColor: isSelected ? 'rgba(212, 160, 23, 0.15)' : COLORS.cardBg,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <DeityIcon
                    deityId={d.id}
                    icon={d.icon}
                    size={20}
                    color={isSelected ? COLORS.gold : COLORS.cream}
                  />
                  <View style={{ marginLeft: SPACING.xs }}>
                    <Text style={{
                      color: isSelected ? COLORS.gold : COLORS.cream,
                      fontSize: FONT_SIZES.sm,
                      fontWeight: isSelected ? '700' : '500',
                    }}>{d.name}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: FONT_SIZES.xs }}>
                      {prog.malas} mala · {prog.count} bead
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ─── #2 · UNIFIED SADHANA SELECTOR ───
             ONE dropdown that lists all existing deities + sandhya +
             sadhana paths, plus "+ Add new Sadhana" at the bottom which
             opens the 3-form menu (deity / sandhya / sadhana path). */}
        <TouchableOpacity
          style={styles.deitySelector}
          onPress={() => setShowSadhanaPicker(true)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            {selectedDeity && (
              <View style={styles.selectorIconWrap}>
                <DeityIcon
                  deityId={selectedDeity.id}
                  icon={selectedDeity.icon}
                  size={22}
                  color={COLORS.gold}
                />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.deityLabel}>Sadhana</Text>
              <Text style={styles.deityName}>
                {selectedDeity ? selectedDeity.name : 'Tap to pick · or + add new ▾'}
              </Text>
            </View>
          </View>
          <Text style={styles.chevron}>▾</Text>
        </TouchableOpacity>

        {/* ─── SR16 ring counter status pill ─── */}
        <TouchableOpacity
          onPress={reconnectSr16}
          activeOpacity={0.75}
          style={{
            alignSelf: 'center',
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 12, paddingVertical: 6,
            marginBottom: 8, borderRadius: 999,
            backgroundColor:
              sr16Status === 'connected' ? 'rgba(123,228,184,0.14)' :
              sr16Status === 'connecting' ? 'rgba(245,197,107,0.14)' :
                                             'rgba(255,255,255,0.05)',
            borderWidth: 1,
            borderColor:
              sr16Status === 'connected' ? 'rgba(123,228,184,0.4)' :
              sr16Status === 'connecting' ? 'rgba(245,197,107,0.4)' :
                                             'rgba(255,255,255,0.15)',
          }}
        >
          <View style={{
            width: 8, height: 8, borderRadius: 4,
            backgroundColor:
              sr16Status === 'connected' ? '#7BE4B8' :
              sr16Status === 'connecting' ? '#F5C56B' : '#7C8CA3',
          }} />
          <Text style={{ fontSize: 12, color: palette.cream, fontWeight: '600' }}>
            {sr16Status === 'connected' ? `Ring · ${sr16Events} tap${sr16Events === 1 ? '' : 's'}` :
             sr16Status === 'connecting' ? 'Ring connecting…' :
                                            'Ring off · tap to connect'}
          </Text>
          {sr16LastError && sr16Status === 'off' ? (
            <Text style={{ fontSize: 10, color: palette.muted, marginLeft: 4 }} numberOfLines={1}>
              {sr16LastError.length > 32 ? sr16LastError.slice(0, 32) + '…' : sr16LastError}
            </Text>
          ) : null}
        </TouchableOpacity>

        {/* ─── #4 · THE JAPA MALA ─── */}
        <Mala
          count={count}
          malas={malas}
          onTap={tap}
          popBead={popBead}
          beadColor={selectedDeity?.malaColor}
          beadHighlight={selectedDeity?.malaHighlight}
          materialName={selectedDeity?.malaMaterial}
        />

        {selectedDeity?.mantra && (
          <Text style={styles.mantra}>“{selectedDeity.mantra}”</Text>
        )}

        {/* Reset + Log past — right under the mala */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.resetBtn} onPress={reset}>
            <Text style={styles.resetBtnText}>↺ Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.manualBtn} onPress={() => setShowManual(true)}>
            <Text style={styles.manualBtnText}>+ Log past</Text>
          </TouchableOpacity>
          {connection && (
            <View style={[styles.bleBtn, styles.bleBtnConnected]}>
              <View style={[styles.bleDot, styles.bleDotOn]} />
              <Text style={[styles.bleBtnText, styles.bleBtnTextOn]}>Ring connected</Text>
            </View>
          )}
        </View>
        <Text style={styles.autoSaveHint}>
          Tap the center bead · 1 mala (108 beads) saves automatically
        </Text>

        {/* ─── #5 · START SOULSYNC ─── */}

        <PulseHighlight
          active={hintMode !== 'none'}
          tooltip={hintMode === 'start'
            ? '👉 Tap here to track this session for your Saadhana Score'
            : hintMode === 'stop'
              ? '👉 Tap here to stop and see your Saadhana Score'
              : undefined}
        >
          <View style={styles.soulsyncRow}>
            <TouchableOpacity
              style={[styles.soulsyncBtn, soulsync.state.active && styles.soulsyncBtnOn]}
              onPress={handleSoulsyncToggle}
            >
              <View style={[styles.soulsyncDot, soulsync.state.active && styles.soulsyncDotOn]} />
              <Text style={[styles.soulsyncText, soulsync.state.active && styles.soulsyncTextOn]}>
                {soulsync.state.active ? '◉ Soulsync recording' : 'Start Soulsync session'}
              </Text>
            </TouchableOpacity>
            {soulsync.state.active && (
              <Text style={styles.peakCount}>
                ✨ {soulsync.state.peaksRegistered} peak{soulsync.state.peaksRegistered === 1 ? '' : 's'}
              </Text>
            )}
          </View>
        </PulseHighlight>

        {/* ─── #6 · TRENDS — live heart + lung while active, before/after table on stop ─── */}
        <LiveVitalsTrends
          bpmSeries={soulsync.state.bpmSeries}
          liveSpo2={soulsync.state.liveSpo2}
          isActive={soulsync.state.active}
        />
        <BeforeAfterVitals practice="japa" isActive={soulsync.state.active} />

        {/* ─── #7 · OVERALL DEITIES BREAKDOWN — japa count per deity all-time.
              Sits at the very bottom of the screen so the primary "Pick a
              Sadhana" + counter + soulsync flow stays uncluttered above. ─── */}
        <View style={styles.deitiesBlock}>
          <TouchableOpacity
            style={styles.deitiesHeader}
            onPress={() => setDeitiesExpanded(v => !v)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.deitiesTitle}>
                Overall Deity Breakdown {deitiesExpanded ? '▾' : '▸'}
              </Text>
              <Text style={styles.deitiesSubtitle}>
                {deitiesExpanded
                  ? 'Tap a deity to switch · tap ⏰ to set reminder'
                  : `${deities.length} active · ${deities.reduce(
                      (s, d) => s + (deityProgress[d.id]?.malas || 0) + d.totalMalas, 0,
                    )} total malas · tap to expand`}
              </Text>
            </View>
            <Text style={styles.deitiesChevron}>{deitiesExpanded ? '−' : '+'}</Text>
          </TouchableOpacity>

          {deitiesExpanded && deities.map(d => {
            const totalForDeity = (deityProgress[d.id]?.malas || 0) + d.totalMalas;
            const isActive = selectedDeity?.id === d.id;
            return (
              <TouchableOpacity
                key={d.id}
                style={[styles.deityListRow, isActive && styles.deityListRowActive]}
                onPress={() => {
                  setSelectedDeity(d);
                  const saved = deityProgress[d.id];
                  setCount(saved?.count ?? 0);
                  setMalas(saved?.malas ?? 0);
                }}
              >
                <View style={styles.deityListIconWrap}>
                  <DeityIcon deityId={d.id} icon={d.icon} size={24} color={COLORS.gold} />
                </View>
                <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                  <Text style={styles.deityListName}>{d.name}</Text>
                  <Text style={styles.deityListMantra} numberOfLines={1}>"{d.mantra}"</Text>
                  <View style={styles.deityListBarTrack}>
                    <View style={[styles.deityListBarFill, { width: `${Math.min(100, totalForDeity * 4)}%` }]} />
                  </View>
                </View>
                <View style={styles.deityListRight}>
                  <Text style={styles.deityListMalas}>{totalForDeity}</Text>
                  <Text style={styles.deityListMalasLabel}>malas</Text>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation?.();
                      setPickingDeityId(d.id);
                    }}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  >
                    <Text style={[styles.deityListAlarm, styles.deityListAlarmTap]}>
                      {d.alarmOn ? `⏰ ${d.prayerAlarm}` : '🔕 Set'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Inline time picker — opens when an alarm chip is tapped */}
          {pickingDeityId && (() => {
            const d = deities.find(x => x.id === pickingDeityId);
            if (!d) return null;
            return (
              <TimePickerField
                value={d!.prayerAlarm || null}
                onChange={(next) => {
                  setPickingDeityId(null);
                  setDeities(prev => prev.map(x =>
                    x.id === d!.id ? { ...x, prayerAlarm: next, alarmOn: true } : x
                  ));
                  showToast(`⏰ ${d!.name} reminder set to ${next}`);
                }}
              />
            );
          })()}
        </View>
      </ScrollView>

      {/* Deity manager modal (replaces removed Deities tab) */}
      <Modal visible={showDeityManager} animationType="slide" onRequestClose={() => setShowDeityManager(false)}>
        <View style={{ flex: 1, backgroundColor: COLORS.deep }}>
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: SPACING.md, paddingTop: 50,
            borderBottomWidth: 1, borderBottomColor: COLORS.border,
          }}>
            <View>
              <Text style={{ color: COLORS.cream, fontSize: 18, fontWeight: '700' }}>
                Choose Deities
              </Text>
              <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>
                Tap to add · tap again to remove
              </Text>
            </View>
            {/* X close — UPPER RIGHT, circular gold-bordered button for
                consistency with the rest of the app's close affordances. */}
            <TouchableOpacity
              onPress={() => setShowDeityManager(false)}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: COLORS.cardBg,
                borderWidth: 1, borderColor: COLORS.gold,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ color: COLORS.gold, fontSize: 18, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <DeityScreen navigation={navigation} route={{ params: {} }} />
        </View>
      </Modal>

      {/* ─── Unified Sadhana Picker — primary entry point ─── */}
      <Modal visible={showSadhanaPicker} transparent animationType="slide" onRequestClose={() => setShowSadhanaPicker(false)}>
        <TouchableOpacity
          style={styles.sadhanaMenuOverlay}
          activeOpacity={1}
          onPress={() => setShowSadhanaPicker(false)}
        >
          <View style={[styles.sadhanaMenuCard, { maxHeight: '85%' }]}>
            <View style={{ width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.sm }} />
            <Text style={styles.sadhanaMenuTitle}>Pick a Sadhana</Text>
            <Text style={styles.sadhanaMenuHint}>
              Existing deities · sandhya japa · sadhana paths — or add a new one
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 4 }}>
              {/* ── Deities ── */}
              {deities.length > 0 && (
                <>
                  <Text style={styles.picSectionLabel}>🪷  DEITIES · {deities.length}</Text>
                  {deities.map(d => {
                    const total = (deityProgress[d.id]?.malas || 0) + d.totalMalas;
                    const isActive = selectedDeity?.id === d.id;
                    return (
                      <TouchableOpacity
                        key={d.id}
                        style={[styles.picRow, isActive && styles.picRowActive]}
                        onPress={() => {
                          setSelectedDeity(d);
                          const saved = deityProgress[d.id];
                          setCount(saved?.count ?? 0);
                          setMalas(saved?.malas ?? 0);
                          setShowSadhanaPicker(false);
                          showToast(`🪷 Active: ${d.name}`);
                        }}
                      >
                        <View style={styles.picIconWrap}>
                          <DeityIcon deityId={d.id} icon={d.icon} size={22} color={COLORS.gold} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.picName}>{d.name}{isActive && '  · active'}</Text>
                          <Text style={styles.picSub}>
                            {total} mala{total !== 1 ? 's' : ''}
                            {d.alarmOn ? ` · ⏰ ${d.prayerAlarm}` : ' · 🔕'}
                            {d.mantra && ` · "${d.mantra}"`}
                          </Text>
                        </View>
                        <Text style={styles.picArrow}>›</Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}

              {/* ── Sandhya Vandan — lives in Plan tab now ── */}
              <Text style={styles.picSectionLabel}>🌅  SANDHYA VANDAN</Text>
              <TouchableOpacity
                style={styles.picRow}
                onPress={() => { setShowSadhanaPicker(false); navigation?.navigate?.('Plan'); }}
              >
                <Text style={styles.picIcon}>🌅</Text>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.picName}>Pratah · Madhyahnika · Sayam</Text>
                  <Text style={styles.picSub}>The 3 daily junctures · tap to configure in Plan</Text>
                </View>
                <Text style={styles.picArrow}>›</Text>
              </TouchableOpacity>

              {/* ── Sadhana Paths ── */}
              {sadhanaPaths.length > 0 && (
                <>
                  <Text style={styles.picSectionLabel}>🛤  SADHANA PATHS · {sadhanaPaths.length}</Text>
                  {sadhanaPaths.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.picRow}
                      onPress={() => {
                        // Activate the Sadhana Path. The first step's deity
                        // becomes the selected deity; the tap handler will
                        // auto-advance through subsequent steps as the user
                        // completes each step's mala goal.
                        setActivePath(p);
                        setActiveStepIndex(0);
                        setActiveStepMalas(0);
                        const firstStep = p.steps?.[0];
                        const firstDeity = firstStep
                          ? deities.find(d => d.name.toLowerCase() === String(firstStep.deity).toLowerCase())
                          : null;
                        if (firstDeity) {
                          setSelectedDeity(firstDeity);
                          showToast(`🛤 ${p.name} · started with ${firstDeity.name}`);
                        } else {
                          showToast(`🛤 ${p.name} · pick a deity first`);
                        }
                        setShowSadhanaPicker(false);
                      }}
                    >
                      <Text style={styles.picIcon}>🛤</Text>
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={styles.picName}>{p.name}</Text>
                        <Text style={styles.picSub}>
                          {p.trigger.kind === 'tithi'
                            ? `Every ${p.trigger.tithi}`
                            : p.trigger.kind === 'weekdays'
                              ? `Weekdays: ${p.trigger.days.map((d: number) => ['S','M','T','W','T','F','S'][d]).join('·')}`
                              : `${p.trigger.dates?.length || 0} dates`}
                          {p.practice && ` · ${p.practice}`}
                        </Text>
                      </View>
                      <Text style={styles.picArrow}>›</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* ── + Add new Sadhana ── */}
              <TouchableOpacity
                style={styles.picAddRow}
                onPress={() => { setShowSadhanaPicker(false); setTimeout(() => setShowSadhanaMenu(true), 320); }}
              >
                <Text style={styles.picIcon}>＋</Text>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.picName, { color: COLORS.gold }]}>Add new Sadhana</Text>
                  <Text style={styles.picSub}>Deity · Sandhya Japa · Sadhana Path</Text>
                </View>
                <Text style={[styles.picArrow, { color: COLORS.gold }]}>›</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* + Sadhana ▾ — 3-action sheet */}
      <Modal visible={showSadhanaMenu} transparent animationType="fade" onRequestClose={() => setShowSadhanaMenu(false)}>
        <TouchableOpacity
          style={styles.sadhanaMenuOverlay}
          activeOpacity={1}
          onPress={() => setShowSadhanaMenu(false)}
        >
          <View style={styles.sadhanaMenuCard}>
            <Text style={styles.sadhanaMenuTitle}>+ Sadhana</Text>
            <Text style={styles.sadhanaMenuHint}>Pick one to add or edit</Text>

            <TouchableOpacity
              style={styles.sadhanaMenuRow}
              onPress={() => { setShowSadhanaMenu(false); setTimeout(() => setShowDeityManager(true), 320); }}
            >
              <Text style={styles.sadhanaMenuIcon}>🪷</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sadhanaMenuLabel}>Add / Edit a Deity</Text>
                <Text style={styles.sadhanaMenuSub}>Pick deity · mantra · daily reminder time</Text>
              </View>
              <Text style={styles.sadhanaMenuArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sadhanaMenuRow}
              onPress={() => { setShowSadhanaMenu(false); navigation?.navigate?.('Plan'); }}
            >
              <Text style={styles.sadhanaMenuIcon}>🌅</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sadhanaMenuLabel}>Sandhya Vandan</Text>
                <Text style={styles.sadhanaMenuSub}>Pratah · Madhyahnika · Sayam — set up in your Plan</Text>
              </View>
              <Text style={styles.sadhanaMenuArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sadhanaMenuRow}
              onPress={() => { setShowSadhanaMenu(false); setTimeout(() => setShowSadhanaPathSheet(true), 320); }}
            >
              <Text style={styles.sadhanaMenuIcon}>🛤</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sadhanaMenuLabel}>Design your own Sadhana Path</Text>
                <Text style={styles.sadhanaMenuSub}>Multi-step japa flow · daily / weekday / specific tithi / specific dates</Text>
              </View>
              <Text style={styles.sadhanaMenuArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sadhanaMenuCancel} onPress={() => setShowSadhanaMenu(false)}>
              <Text style={styles.sadhanaMenuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sadhana Path sheet — tithi/date-aware builder */}
      <SadhanaPathSheet
        visible={showSadhanaPathSheet}
        onClose={() => setShowSadhanaPathSheet(false)}
        onSaved={() => { setShowSadhanaPathSheet(false); showToast('✓ Sadhana Path saved'); }}
      />

      {/* Sadhana Depth Score trend */}
      <DepthTrendModal
        visible={showDepthTrend}
        onClose={() => setShowDepthTrend(false)}
      />

      {/* Saadhana Score popup — shown after a Soulsync session stops */}
      <SessionScorePopup
        visible={showScoreModal}
        snapshot={sessionSnap}
        onClose={() => setShowScoreModal(false)}
        onViewInsights={() => {
          setShowScoreModal(false);
          navigation?.navigate?.('History');
        }}
      />

      {/* Deity Picker Modal */}
      <Modal visible={showPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Choose Deity</Text>
            {deities.length === 0 ? (
              <Text style={styles.emptyText}>
                No deities yet. Tap below to add some.
              </Text>
            ) : (
              <FlatList
                data={deities}
                keyExtractor={d => d.id}
                scrollEnabled={false}
                renderItem={({ item: d }) => (
                  <TouchableOpacity
                    style={[
                      styles.deityPickerItem,
                      selectedDeity?.id === d.id && styles.deityPickerItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedDeity(d);
                      setShowPicker(false);
                    }}
                  >
                    <View style={styles.deityPickerIconWrap}>
                      <DeityIcon deityId={d.id} icon={d.icon} size={22} color={COLORS.gold} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deityPickerName}>{d.name}</Text>
                      <Text style={styles.deityPickerMantra}>{d.mantra}</Text>
                    </View>
                    {selectedDeity?.id === d.id && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                )}
              />
            )}

            {/* T5: + Add Deity — routes to Deities tab with auto-open + origin marker */}
            <TouchableOpacity
              style={styles.addDeityRow}
              onPress={() => {
                setShowPicker(false);
                navigation?.navigate?.('Deities', { openAdd: true, origin: 'japa' });
              }}
            >
              <View style={styles.addDeityIcon}>
                <Text style={styles.addDeityPlus}>+</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addDeityName}>Add Deity</Text>
                <Text style={styles.addDeityHint}>Browse catalog or add your own</Text>
              </View>
              <Text style={styles.addDeityArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowPicker(false)}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* BLE Pair Modal */}
      <Modal visible={showBleModal} transparent animationType="slide" onRequestClose={() => { stopScanRef.current?.(); setShowBleModal(false); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={styles.modalTitle}>Pair Saadhana Ring</Text>
              {scanning && <RingSpinner size={20} style={{ marginLeft: 12 }} />}
            </View>
            <Text style={{ fontSize: 12, color: COLORS.muted, marginBottom: SPACING.md }}>
              Make sure your finger-counter is powered on and in pairing mode. Each button press will count as 1 japa.
            </Text>
            <FlatList
              data={scannedDevices}
              keyExtractor={d => d.id}
              scrollEnabled={false}
              ListEmptyComponent={
                <Text style={{ color: COLORS.muted, fontSize: 13, textAlign: 'center', paddingVertical: SPACING.lg, fontStyle: 'italic' }}>
                  {scanning ? 'Searching for devices…' : 'No devices found. Try again.'}
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.deviceRow}
                  onPress={() => handleConnect(item.id, item.name)}
                  disabled={connectingId === item.id}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deviceName}>{item.name}</Text>
                    <Text style={styles.deviceMeta}>
                      {item.id.slice(-8)}{item.rssi ? ` · ${item.rssi} dBm` : ''}
                    </Text>
                  </View>
                  {connectingId === item.id ? (
                    <RingSpinner size={22} />
                  ) : (
                    <Text style={styles.connectArrow}>Connect →</Text>
                  )}
                </TouchableOpacity>
              )}
            />
            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
              {!scanning && (
                <TouchableOpacity
                  style={[styles.primaryBtn, { flex: 1 }]}
                  onPress={() => {
                    setScannedDevices([]);
                    setScanning(true);
                    stopScanRef.current = scanForDevices(
                      d => setScannedDevices(p => [...p, d]),
                      err => { showToast(err); setScanning(false); },
                      15000
                    );
                    setTimeout(() => setScanning(false), 15000);
                  }}
                >
                  <Text style={styles.primaryBtnText}>🔄 Rescan</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.cancelBtn, { flex: 1 }]}
                onPress={() => { stopScanRef.current?.(); setShowBleModal(false); setScanning(false); }}
              >
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manual Japa Entry Modal */}
      <Modal visible={showManual} transparent animationType="slide" onRequestClose={() => setShowManual(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Log past japas</Text>
            <Text style={{ fontSize: 12, color: COLORS.muted, marginBottom: SPACING.md }}>
              Enter malas or japas you've already done. They'll be added to your history & dashboard.
            </Text>

            <Text style={styles.fieldLabel}>Deity</Text>
            <View style={[styles.deitySelector, { marginBottom: SPACING.md }]}>
              <Text style={styles.deityName}>
                {selectedDeity ? `${selectedDeity.icon} ${selectedDeity.name}` : 'Select deity above first'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Malas</Text>
                <TextInput
                  style={styles.input}
                  value={manualMalas}
                  onChangeText={setManualMalas}
                  placeholder="0"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Extra Japas</Text>
                <TextInput
                  style={styles.input}
                  value={manualJapas}
                  onChangeText={setManualJapas}
                  placeholder="0"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <Text style={styles.fieldHint}>
              {manualMalas || manualJapas
                ? `Total: ${(parseInt(manualMalas, 10) || 0) * 108 + (parseInt(manualJapas, 10) || 0)} japas`
                : 'e.g. 5 malas = 540 japas'}
            </Text>

            <Text style={styles.fieldLabel}>Date</Text>
            <TextInput
              style={styles.input}
              value={manualDate}
              onChangeText={setManualDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.muted}
            />

            <TouchableOpacity style={styles.primaryBtn} onPress={submitManual}>
              <Text style={styles.primaryBtnText}>Log this</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowManual(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.deep,
  },
  content: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    paddingBottom: 100,
  },
  header: {
    marginBottom: SPACING.lg,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    color: C.cream,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 12,
    color: C.muted,
    textAlign: 'center',
  },
  // ── Lifetime totals pill (top-right of header, never overlaps mala) ──
  lifetimePill: {
    position: 'absolute',
    top: -4,
    right: 0,
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    borderRadius: 10,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.3)',
    alignItems: 'flex-end',
  },
  lifetimePillText: { fontSize: 10, color: C.cream },
  lifetimePillNumber: { color: C.gold, fontWeight: '700', fontSize: 11 },
  lifetimePillSubtext: {
    fontSize: 8, color: C.muted, fontStyle: 'italic',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },

  // ── Deities list (inline replacement for removed Deities tab) ──
  deitiesBlock: { marginHorizontal: SPACING.md, marginTop: SPACING.lg },
  deitiesHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  deitiesTitle: { fontSize: 14, color: C.gold, fontWeight: '700', letterSpacing: 0.5 },
  deitiesSubtitle: { fontSize: 11, color: C.muted, marginTop: 2, fontStyle: 'italic' },
  deitiesChevron: {
    fontSize: 22, color: C.gold, fontWeight: '300',
    paddingHorizontal: 8,
  },
  deityListRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.sm,
    backgroundColor: C.cardBg, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    marginBottom: 6,
  },
  deityListRowActive: { borderColor: C.gold, backgroundColor: 'rgba(212,160,23,0.1)' },
  deityListIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(212,160,23,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  deityListName: { fontSize: 13, color: C.cream, fontWeight: '600' },
  deityListMantra: { fontSize: 10, color: C.muted, fontStyle: 'italic', marginTop: 1 },
  deityListBarTrack: {
    height: 3, backgroundColor: 'rgba(212,160,23,0.15)', borderRadius: 2,
    marginTop: 4, overflow: 'hidden',
  },
  deityListBarFill: { height: '100%', backgroundColor: C.gold },
  deityListRight: { alignItems: 'flex-end', marginLeft: SPACING.sm },
  deityListMalas: { fontSize: 16, color: C.gold, fontWeight: '700' },
  deityListMalasLabel: { fontSize: 8, color: C.muted, letterSpacing: 0.5 },
  deityListAlarm: { fontSize: 10, color: C.muted, marginTop: 4 },
  deityListAlarmTap: {
    color: C.gold, fontWeight: '700',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6, backgroundColor: 'rgba(212,160,23,0.12)',
    overflow: 'hidden',
  },
  addDeityBtn: {
    marginTop: SPACING.sm, paddingVertical: 10,
    borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: C.gold, alignItems: 'center',
  },
  addDeityBtnText: { color: C.gold, fontSize: 12, fontWeight: '700' },

  // + Sadhana ▾ button and 3-action menu
  sadhanaActionBtn: {
    marginTop: SPACING.sm, paddingVertical: 10,
    borderRadius: 10, borderStyle: 'dashed',
    borderWidth: 1, borderColor: C.gold,
    backgroundColor: 'rgba(212,160,23,0.06)',
    alignItems: 'center',
  },
  sadhanaActionText: { color: C.gold, fontWeight: '700', fontSize: 13 },

  sadhanaMenuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sadhanaMenuCard: {
    backgroundColor: C.darkBg,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: SPACING.md, paddingBottom: SPACING.xl,
    maxHeight: '88%',
  },
  sadhanaMenuTitle: { color: C.cream, fontSize: 20, fontWeight: '800' },
  sadhanaMenuHint: { color: C.muted, fontSize: 12, fontStyle: 'italic', marginBottom: SPACING.md },
  sadhanaMenuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.cardBg, marginBottom: 8,
  },
  sadhanaMenuIcon: { fontSize: 26, marginRight: 12, width: 32 },
  sadhanaMenuLabel: { color: C.cream, fontSize: 15, fontWeight: '700' },
  sadhanaMenuSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  sadhanaMenuArrow: { color: C.gold, fontSize: 22, paddingHorizontal: 6 },
  sadhanaMenuCancel: { paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  sadhanaMenuCancelText: { color: C.muted, fontSize: 13 },

  // Unified Sadhana picker rows
  picSectionLabel: {
    fontSize: 10, color: C.muted, fontWeight: '800',
    letterSpacing: 1.2, marginTop: SPACING.md, marginBottom: 6,
  },
  picRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 10, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.cardBg, marginBottom: 6,
  },
  picRowActive: { borderColor: C.gold, backgroundColor: 'rgba(212,160,23,0.10)' },
  picIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(212,160,23,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  picIcon: { fontSize: 22, width: 36, textAlign: 'center' },
  picName: { color: C.cream, fontSize: 14, fontWeight: '700' },
  picSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  picArrow: { color: C.gold, fontSize: 20, paddingHorizontal: 4 },
  picAddRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 10,
    borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.gold,
    backgroundColor: 'rgba(212,160,23,0.06)',
    marginTop: SPACING.sm, marginBottom: 8,
  },
  deitySelector: {
    backgroundColor: C.cardBg,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deityLabel: {
    fontSize: 12,
    color: C.muted,
    marginBottom: 4,
  },
  deityName: {
    fontSize: 16,
    color: C.cream,
    fontWeight: '500',
  },
  chevron: {
    fontSize: 16,
    color: C.muted,
  },
  mantra: {
    fontSize: 14,
    color: C.gold,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  // ── Soulsync ──
  soulsyncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
  },
  soulsyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: 'rgba(214, 224, 64, 0.4)',
  },
  soulsyncBtnOn: {
    backgroundColor: 'rgba(214, 224, 64, 0.15)',
    borderColor: '#d6e040',
  },
  soulsyncDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.muted,
  },
  soulsyncDotOn: {
    backgroundColor: '#d6e040',
    shadowColor: '#d6e040',
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 6,
  },
  soulsyncText: { fontSize: 12, color: C.muted, fontWeight: '600' },
  soulsyncTextOn: { color: '#d6e040' },
  peakCount: { fontSize: 12, color: '#fbff7a', fontWeight: '700' },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    backgroundColor: 'rgba(26, 31, 58, 0.5)',
    borderRadius: 12,
    paddingVertical: SPACING.md,
    marginHorizontal: SPACING.sm,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(212, 160, 23, 0.2)',
  },
  statCol: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    color: C.gold,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 11,
    color: C.muted,
    marginTop: 4,
  },

  // 3×2 KPI grid — lifetime row on top, today row below (gold-tinted)
  kpiGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    backgroundColor: 'rgba(26, 31, 58, 0.5)', borderRadius: 12,
    overflow: 'hidden',
  },
  kpiCell: {
    width: '33.333%',
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, paddingHorizontal: 4,
    borderColor: 'rgba(212, 160, 23, 0.12)',
    borderRightWidth: 1, borderBottomWidth: 1,
  },
  kpiCellToday: { backgroundColor: 'rgba(212, 160, 23, 0.07)' },
  kpiCellValue: { fontSize: 18, color: C.cream, fontWeight: '700' },
  kpiCellValueToday: { color: C.gold },
  kpiCellLabel: {
    fontSize: 10, color: C.muted, marginTop: 2,
    letterSpacing: 0.5, fontWeight: '600',
  },

  controls: {
    flexDirection: 'row',
    gap: SPACING.md,
    justifyContent: 'center',
  },
  resetBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.border,
  },
  resetBtnText: {
    fontSize: 13,
    color: C.muted,
    fontWeight: '500',
  },
  manualBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderWidth: 1,
    borderColor: C.gold,
  },
  manualBtnText: {
    fontSize: 13,
    color: C.gold,
    fontWeight: '600',
  },
  bleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.4)',
  },
  bleBtnConnected: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    borderColor: C.leaf,
  },
  bleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.muted,
  },
  bleDotOn: {
    backgroundColor: C.leaf,
    shadowColor: C.leaf,
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 4,
  },
  bleBtnText: { fontSize: 12, color: C.muted, fontWeight: '600' },
  bleBtnTextOn: { color: C.leaf },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    backgroundColor: C.cardBg,
    borderRadius: 8,
    marginBottom: 6,
  },
  deviceName: { fontSize: 14, color: C.cream, fontWeight: '600' },
  deviceMeta: { fontSize: 11, color: C.muted, marginTop: 2 },
  connectArrow: { fontSize: 12, color: C.gold, fontWeight: '600' },
  autoSaveHint: {
    fontSize: 11,
    color: C.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  fieldLabel: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  fieldHint: {
    fontSize: 11,
    color: C.gold,
    marginTop: 4,
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: C.cardBg,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: C.cream,
    fontSize: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  primaryBtn: {
    backgroundColor: C.gold,
    borderRadius: 10,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  primaryBtnText: { color: C.deep, fontWeight: '700', fontSize: 14 },
  cancelBtn: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  cancelBtnText: { color: C.muted, fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: C.darkBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: 18,
    color: C.cream,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  emptyText: {
    textAlign: 'center',
    color: C.muted,
    fontSize: 14,
    paddingVertical: SPACING.lg,
  },
  deityPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  deityPickerItemSelected: {
    backgroundColor: 'rgba(212, 160, 23, 0.1)',
    paddingHorizontal: SPACING.sm,
    borderRadius: 8,
    marginVertical: 4,
    borderBottomWidth: 0,
  },
  deityPickerIcon: {
    fontSize: 24,
    marginRight: SPACING.md,
  },
  deityPickerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  selectorIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  deityPickerName: {
    fontSize: 15,
    color: C.cream,
    fontWeight: '500',
  },
  deityPickerMantra: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
    fontStyle: 'italic',
  },
  checkmark: {
    fontSize: 18,
    color: C.gold,
  },
  // T5: + Add Deity row inside picker
  addDeityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    marginTop: SPACING.sm,
    borderRadius: 10,
    backgroundColor: 'rgba(212, 160, 23, 0.10)',
    borderWidth: 1.5,
    borderColor: C.gold,
    borderStyle: 'dashed',
  },
  addDeityIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(212, 160, 23, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  addDeityPlus: {
    fontSize: 22,
    color: C.gold,
    fontWeight: '700',
    lineHeight: 24,
  },
  addDeityName: {
    fontSize: 15,
    color: C.gold,
    fontWeight: '700',
  },
  addDeityHint: {
    fontSize: 11,
    color: C.muted,
    marginTop: 2,
    fontStyle: 'italic',
  },
  addDeityArrow: {
    fontSize: 22,
    color: C.gold,
    fontWeight: '600',
  },
  closeBtn: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  closeBtnText: {
    color: C.cream,
    fontSize: 14,
    fontWeight: '500',
  },
});


// Static dark styles for helpers rendered outside the palette-aware component.
const styles = makeStyles(COLORS);
