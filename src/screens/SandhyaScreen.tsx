import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Switch,
  TextInput,
} from 'react-native';
import {
  SANDHYAS,
  PROCEDURE,
  RULES,
  PREREQUISITES,
  SandhyaPart,
  ProcedureStep,
} from '../sandhyaData';
import { Storage } from '../storage';
import { COLORS, SPACING } from '../theme';

interface SandhyaSettings {
  times: Record<'pratah' | 'madhyahnika' | 'sayam', string>;
  reminders: Record<'pratah' | 'madhyahnika' | 'sayam', boolean>;
  japaCount: Record<'pratah' | 'madhyahnika' | 'sayam', number>;
}

const DEFAULT_SETTINGS: SandhyaSettings = {
  times: { pratah: '05:30', madhyahnika: '12:00', sayam: '18:30' },
  reminders: { pratah: false, madhyahnika: false, sayam: false },
  japaCount: { pratah: 0, madhyahnika: 0, sayam: 0 },
};

export const SandhyaScreen = () => {
  const [settings, setSettings] = useState<SandhyaSettings>(DEFAULT_SETTINGS);
  const [selected, setSelected] = useState<SandhyaPart | null>(null);
  const [view, setView] = useState<'today' | 'rules'>('today');

  useEffect(() => {
    Storage.get<SandhyaSettings>('sandhyaSettings', DEFAULT_SETTINGS).then(setSettings);
  }, []);

  useEffect(() => {
    Storage.set('sandhyaSettings', settings);
  }, [settings]);

  const updateTime = (id: SandhyaPart['id'], time: string) => {
    setSettings(s => ({ ...s, times: { ...s.times, [id]: time } }));
  };

  const toggleReminder = (id: SandhyaPart['id']) => {
    setSettings(s => ({
      ...s,
      reminders: { ...s.reminders, [id]: !s.reminders[id] },
    }));
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Sandhya Vandanam</Text>
          <Text style={styles.subtitle}>Three daily junctures · Vedic ritual</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tab, view === 'today' && styles.tabActive]}
            onPress={() => setView('today')}
          >
            <Text style={[styles.tabText, view === 'today' && styles.tabTextActive]}>
              Today's Sandhyas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, view === 'rules' && styles.tabActive]}
            onPress={() => setView('rules')}
          >
            <Text style={[styles.tabText, view === 'rules' && styles.tabTextActive]}>
              Rules & Notes
            </Text>
          </TouchableOpacity>
        </View>

        {view === 'today' && (
          <>
            {/* Quick intro */}
            <View style={styles.introCard}>
              <Text style={styles.introTitle}>What is Sandhya Vandanam?</Text>
              <Text style={styles.introText}>
                A daily Vedic worship at the three sandhi-kalas (junctures) — dawn, noon
                and dusk. Centred on the Gayatri Mantra and offering of arghya to Surya.
                Performed by initiated Hindus (dvija) after upanayana.
              </Text>
            </View>

            {/* Three sandhya cards */}
            {SANDHYAS.map(s => {
              const time = settings.times[s.id];
              const reminderOn = settings.reminders[s.id];
              return (
                <TouchableOpacity
                  key={s.id}
                  style={styles.sandhyaCard}
                  onPress={() => setSelected(s)}
                  activeOpacity={0.85}
                >
                  <View style={styles.sandhyaIconCircle}>
                    <Text style={styles.sandhyaIcon}>{s.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sandhyaName}>{s.name}</Text>
                    <Text style={styles.sandhyaWindow}>{s.timeWindow}</Text>
                    <View style={styles.sandhyaMeta}>
                      <Text style={styles.sandhyaTime}>⏰ {time}</Text>
                      <Text style={styles.sandhyaReminder}>
                        {reminderOn ? '🔔 Reminder ON' : '🔕 Reminder OFF'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              );
            })}

            {/* Quick prerequisites */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Prerequisites</Text>
              {PREREQUISITES.map((p, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bullet}>✓</Text>
                  <Text style={styles.bulletText}>{p}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {view === 'rules' && (
          <View style={{ paddingHorizontal: SPACING.md }}>
            {RULES.map(r => (
              <View key={r.id} style={styles.ruleCard}>
                <Text style={styles.ruleTitle}>{r.title}</Text>
                <Text style={styles.ruleText}>{r.text}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected && (
          <SandhyaDetail
            sandhya={selected}
            time={settings.times[selected.id]}
            reminderOn={settings.reminders[selected.id]}
            onTimeChange={t => updateTime(selected.id, t)}
            onToggleReminder={() => toggleReminder(selected.id)}
            onClose={() => setSelected(null)}
          />
        )}
      </Modal>
    </View>
  );
};

const SandhyaDetail: React.FC<{
  sandhya: SandhyaPart;
  time: string;
  reminderOn: boolean;
  onTimeChange: (t: string) => void;
  onToggleReminder: () => void;
  onClose: () => void;
}> = ({ sandhya, time, reminderOn, onTimeChange, onToggleReminder, onClose }) => {
  return (
    <View style={styles.detailContainer}>
      <ScrollView contentContainerStyle={styles.detailContent}>
        {/* Hero */}
        <View style={styles.detailHero}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.detailIcon}>{sandhya.icon}</Text>
          <Text style={styles.detailName}>{sandhya.name}</Text>
          <Text style={styles.detailWindow}>{sandhya.timeWindow}</Text>
        </View>

        {/* Time + Reminder Card */}
        <View style={styles.timeCard}>
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>Your Time</Text>
            <TextInput
              style={styles.timeInput}
              value={time}
              onChangeText={onTimeChange}
              placeholder="HH:MM"
              placeholderTextColor={COLORS.muted}
            />
          </View>
          <View style={styles.reminderRow}>
            <Text style={styles.reminderLabel}>Daily Reminder</Text>
            <Switch
              value={reminderOn}
              onValueChange={onToggleReminder}
              trackColor={{ false: COLORS.border, true: COLORS.gold }}
              thumbColor={reminderOn ? COLORS.cream : COLORS.muted}
            />
          </View>
        </View>

        {/* Quick info */}
        <View style={styles.infoGrid}>
          <InfoBox label="Facing" value={sandhya.facing} />
          <InfoBox label="Posture" value={sandhya.bestPosture} />
          <InfoBox label="Argya direction" value={sandhya.argyaDirection} />
          <InfoBox
            label="Argya count"
            value={`${sandhya.argyaCount} times${
              sandhya.prayascittaArgya > 0 ? ` (+${sandhya.prayascittaArgya} prayaschitta)` : ''
            }`}
          />
        </View>

        {/* Significance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Significance</Text>
          <Text style={styles.bodyText}>{sandhya.significance}</Text>
        </View>

        {/* Procedure */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Step-by-Step Procedure</Text>
          {PROCEDURE.map(step => (
            <ProcedureCard key={step.index} step={step} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const InfoBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.infoBox}>
    <Text style={styles.infoLabel}>{label.toUpperCase()}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const ProcedureCard: React.FC<{ step: ProcedureStep }> = ({ step }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      style={styles.procCard}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.85}
    >
      <View style={styles.procHeader}>
        <View style={styles.procNum}>
          <Text style={styles.procNumText}>{step.index}</Text>
        </View>
        <Text style={styles.procName}>{step.name}</Text>
        <Text style={styles.procExpand}>{expanded ? '▾' : '▸'}</Text>
      </View>
      <Text style={styles.procDesc}>{step.description}</Text>
      {expanded && (
        <View style={styles.procExpanded}>
          {step.mantra && (
            <View style={styles.mantraBlock}>
              <Text style={styles.mantraLabel}>MANTRA (Sanskrit)</Text>
              <Text style={styles.mantraText}>{step.mantra}</Text>
            </View>
          )}
          {step.transliteration && (
            <View style={styles.mantraBlock}>
              <Text style={styles.mantraLabel}>Transliteration</Text>
              <Text style={styles.transliterationText}>{step.transliteration}</Text>
            </View>
          )}
          {step.meaning && (
            <View style={styles.mantraBlock}>
              <Text style={styles.mantraLabel}>Meaning</Text>
              <Text style={styles.meaningText}>{step.meaning}</Text>
            </View>
          )}
          {step.count && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>🔁 {step.count}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  content: { paddingTop: SPACING.lg, paddingBottom: SPACING.xl },
  header: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  title: { fontSize: 24, color: COLORS.cream, fontWeight: '600', marginBottom: 6 },
  subtitle: { fontSize: 12, color: COLORS.muted },

  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  tabText: { fontSize: 13, color: COLORS.muted, fontWeight: '500' },
  tabTextActive: { color: COLORS.deep, fontWeight: '600' },

  introCard: {
    marginHorizontal: SPACING.md,
    backgroundColor: 'rgba(212, 160, 23, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
    padding: SPACING.md,
    borderRadius: 10,
    marginBottom: SPACING.lg,
  },
  introTitle: { fontSize: 13, color: COLORS.gold, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 },
  introText: { fontSize: 13, color: COLORS.cream, lineHeight: 19 },

  sandhyaCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.15)',
  },
  sandhyaIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 160, 23, 0.4)',
  },
  sandhyaIcon: { fontSize: 30 },
  sandhyaName: { fontSize: 15, color: COLORS.cream, fontWeight: '600' },
  sandhyaWindow: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  sandhyaMeta: { flexDirection: 'row', gap: SPACING.md, marginTop: 6 },
  sandhyaTime: { fontSize: 12, color: COLORS.gold, fontWeight: '600' },
  sandhyaReminder: { fontSize: 11, color: COLORS.saffron },
  chevron: { fontSize: 22, color: COLORS.muted, marginLeft: SPACING.sm },

  section: { paddingHorizontal: SPACING.md, marginBottom: SPACING.lg, marginTop: SPACING.md },
  sectionTitle: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  bodyText: { fontSize: 13, color: COLORS.cream, lineHeight: 20 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  bullet: {
    fontSize: 12,
    color: COLORS.gold,
    marginRight: SPACING.sm,
    marginTop: 1,
    fontWeight: '700',
  },
  bulletText: { flex: 1, fontSize: 13, color: COLORS.cream, lineHeight: 19 },

  ruleCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
  },
  ruleTitle: { fontSize: 13, color: COLORS.gold, fontWeight: '700', marginBottom: 4 },
  ruleText: { fontSize: 13, color: COLORS.cream, lineHeight: 19 },

  detailContainer: { flex: 1, backgroundColor: COLORS.deep },
  detailContent: { paddingBottom: SPACING.xl },
  detailHero: {
    backgroundColor: COLORS.cardBg,
    paddingTop: 50,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 160, 23, 0.2)',
  },
  closeBtn: {
    position: 'absolute',
    top: 50,
    right: SPACING.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: { color: COLORS.cream, fontSize: 16 },
  detailIcon: { fontSize: 64, marginBottom: SPACING.md },
  detailName: { fontSize: 22, color: COLORS.cream, fontWeight: '700', marginBottom: 4 },
  detailWindow: { fontSize: 12, color: COLORS.muted, textAlign: 'center' },

  timeCard: {
    margin: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.saffron,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  timeLabel: { fontSize: 14, color: COLORS.cream, fontWeight: '500' },
  timeInput: {
    backgroundColor: COLORS.deep,
    borderRadius: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.cream,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 110,
    textAlign: 'center',
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  reminderLabel: { fontSize: 14, color: COLORS.cream, fontWeight: '500' },

  infoGrid: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  infoBox: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    padding: SPACING.sm,
    marginBottom: 6,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.gold,
  },
  infoLabel: {
    fontSize: 10,
    color: COLORS.muted,
    letterSpacing: 1.2,
    marginBottom: 2,
    fontWeight: '600',
  },
  infoValue: { fontSize: 13, color: COLORS.cream },

  procCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(212, 160, 23, 0.4)',
  },
  procHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  procNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(212, 160, 23, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  procNumText: { fontSize: 12, color: COLORS.gold, fontWeight: '700' },
  procName: { flex: 1, fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  procExpand: { fontSize: 14, color: COLORS.gold },
  procDesc: { fontSize: 12, color: COLORS.muted, lineHeight: 18, marginLeft: 36 },
  procExpanded: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    marginLeft: 36,
  },
  mantraBlock: { marginBottom: SPACING.sm },
  mantraLabel: {
    fontSize: 10,
    color: COLORS.gold,
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 4,
  },
  mantraText: {
    fontSize: 14,
    color: COLORS.cream,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  transliterationText: {
    fontSize: 12,
    color: COLORS.cream,
    lineHeight: 18,
  },
  meaningText: {
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 17,
    fontStyle: 'italic',
  },
  countBadge: {
    backgroundColor: 'rgba(255, 140, 66, 0.15)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  countText: { fontSize: 11, color: COLORS.saffron, fontWeight: '600' },
});
