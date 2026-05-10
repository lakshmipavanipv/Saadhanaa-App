import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { PANCHANG_FESTIVALS, REGIONS, PanchangFestival } from '../festivalsData';
import { Storage } from '../storage';
import { getDaysUntil } from '../utils';
import { COLORS, SPACING } from '../theme';

type CheckedState = Record<string, boolean>;

export const FestivalScreen = () => {
  const [region, setRegion] = useState<(typeof REGIONS)[number]>('All');
  const [checked, setChecked] = useState<CheckedState>({});
  const [selected, setSelected] = useState<PanchangFestival | null>(null);

  useEffect(() => {
    Storage.get<CheckedState>('festChecked', {}).then(setChecked);
  }, []);

  useEffect(() => {
    Storage.set('festChecked', checked);
  }, [checked]);

  const toggle = (festId: string, itemId: number) => {
    const key = `${festId}-${itemId}`;
    setChecked(p => ({ ...p, [key]: !p[key] }));
  };

  const festivals = PANCHANG_FESTIVALS
    .filter(f => region === 'All' || f.region === region)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const upcoming = festivals.filter(f => getDaysUntil(f.date) >= 0);
  const past = festivals.filter(f => getDaysUntil(f.date) < 0);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Festival Calendar</Text>
          <Text style={styles.subtitle}>Panchang · Tithi · Nakshatra · Rituals</Text>
        </View>

        {/* Region Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow}>
          {REGIONS.map(r => (
            <TouchableOpacity
              key={r}
              style={[styles.tab, region === r && styles.tabActive]}
              onPress={() => setRegion(r)}
            >
              <Text style={[styles.tabText, region === r && styles.tabTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Upcoming Festivals */}
        <Text style={styles.sectionLabel}>UPCOMING ({upcoming.length})</Text>
        {upcoming.map((fest, i) => (
          <FestCard key={fest.id} fest={fest} onPress={() => setSelected(fest)} />
        ))}

        {past.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>
              PASSED ({past.length})
            </Text>
            {past.slice(-5).reverse().map(fest => (
              <FestCard key={fest.id} fest={fest} onPress={() => setSelected(fest)} isPast />
            ))}
          </>
        )}
      </ScrollView>

      {/* Festival Detail Modal */}
      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected && (
          <FestivalDetail
            fest={selected}
            checked={checked}
            onToggle={toggle}
            onClose={() => setSelected(null)}
          />
        )}
      </Modal>
    </View>
  );
};

const FestCard: React.FC<{
  fest: PanchangFestival;
  onPress: () => void;
  isPast?: boolean;
}> = ({ fest, onPress, isPast }) => {
  const dl = getDaysUntil(fest.date);
  const dateLabel = new Date(fest.date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const countdown =
    dl === 0
      ? '🎊 Today!'
      : dl === 1
      ? '⏰ Tomorrow'
      : dl > 0 && dl <= 7
      ? `⚡ In ${dl} days`
      : dl > 0
      ? `📅 ${dl} days away`
      : '✓ Passed';

  return (
    <TouchableOpacity
      style={[styles.festCard, isPast && { opacity: 0.5 }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.festIconCircle}>
        <Text style={styles.festIconText}>{fest.deityIcon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.festName}>{fest.name}</Text>
        <Text style={styles.festDeity}>{fest.deity}</Text>
        <View style={styles.festMetaRow}>
          <Text style={styles.festTithi}>
            {fest.tithi}
            {fest.paksha ? ` · ${fest.paksha}` : ''}
          </Text>
          <Text style={styles.festDate}>{dateLabel}</Text>
        </View>
        <Text style={styles.festCountdown}>{countdown}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
};

const FestivalDetail: React.FC<{
  fest: PanchangFestival;
  checked: CheckedState;
  onToggle: (festId: string, itemId: number) => void;
  onClose: () => void;
}> = ({ fest, checked, onToggle, onClose }) => {
  const dateLabel = new Date(fest.date).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const done = fest.checklist.filter(x => checked[`${fest.id}-${x.id}`]).length;

  return (
    <View style={styles.detailContainer}>
      <ScrollView contentContainerStyle={styles.detailContent}>
        {/* Hero */}
        <View style={styles.detailHero}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.detailIcon}>{fest.deityIcon}</Text>
          <Text style={styles.detailName}>{fest.name}</Text>
          <Text style={styles.detailDeity}>{fest.deity}</Text>
          <Text style={styles.detailDate}>{dateLabel}</Text>
        </View>

        {/* Panchang Card */}
        <View style={styles.panchangCard}>
          <Text style={styles.panchangTitle}>PANCHANG</Text>
          <View style={styles.panchangGrid}>
            <PanchangRow label="Tithi" value={fest.tithi} />
            {fest.paksha && <PanchangRow label="Paksha" value={fest.paksha} />}
            <PanchangRow label="Vara" value={fest.vara} />
            <PanchangRow label="Nakshatra" value={fest.nakshatra} />
            <PanchangRow label="Maas (Month)" value={fest.month} />
          </View>
        </View>

        {/* Significance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Significance</Text>
          <Text style={styles.bodyText}>{fest.significance}</Text>
        </View>

        {/* Timing */}
        <View style={styles.timingCard}>
          <Text style={styles.timingLabel}>⏰ Auspicious Timing</Text>
          <Text style={styles.timingValue}>{fest.timing}</Text>
        </View>

        {/* What To Do */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What to Do</Text>
          {fest.whatToDo.map((task, i) => (
            <View key={i} style={styles.taskRow}>
              <View style={styles.taskBullet}>
                <Text style={styles.taskBulletText}>{i + 1}</Text>
              </View>
              <Text style={styles.taskText}>{task}</Text>
            </View>
          ))}
        </View>

        {/* Checklist */}
        <View style={styles.section}>
          <View style={styles.checklistHeader}>
            <Text style={styles.sectionTitle}>Shopping & Prep</Text>
            <Text style={styles.progressText}>
              {done}/{fest.checklist.length}
            </Text>
          </View>
          {fest.checklist.map(item => {
            const key = `${fest.id}-${item.id}`;
            const isChecked = !!checked[key];
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.checkRow}
                onPress={() => onToggle(fest.id, item.id)}
              >
                <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                  {isChecked && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={[styles.checkText, isChecked && styles.checkTextDone]}>
                  {item.text}
                </Text>
                <Text style={styles.checkTag}>{item.tag}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Wish */}
        <View style={styles.wishCard}>
          <Text style={styles.wishMain}>{fest.wish}</Text>
          <Text style={styles.wishSub}>{fest.wishSub}</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const PanchangRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.panchangRow}>
    <Text style={styles.panchangRowLabel}>{label}</Text>
    <Text style={styles.panchangRowValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  content: { paddingTop: SPACING.lg, paddingBottom: SPACING.xl },
  header: { paddingHorizontal: SPACING.md, marginBottom: SPACING.lg },
  title: { fontSize: 24, color: COLORS.cream, fontWeight: '600', marginBottom: SPACING.sm },
  subtitle: { fontSize: 12, color: COLORS.muted, letterSpacing: 0.5 },
  tabsRow: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    flexGrow: 0,
  },
  tab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: COLORS.cardBg,
    marginRight: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  tabText: { fontSize: 12, color: COLORS.muted, fontWeight: '500' },
  tabTextActive: { color: COLORS.deep, fontWeight: '600' },
  sectionLabel: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  festCard: {
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
  festIconCircle: {
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
  festIconText: { fontSize: 28 },
  festName: { fontSize: 15, color: COLORS.cream, fontWeight: '600' },
  festDeity: { fontSize: 12, color: COLORS.gold, marginTop: 2 },
  festMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    flexWrap: 'wrap',
  },
  festTithi: { fontSize: 11, color: COLORS.muted, fontStyle: 'italic' },
  festDate: { fontSize: 11, color: COLORS.muted },
  festCountdown: { fontSize: 12, color: COLORS.saffron, marginTop: 4, fontWeight: '500' },
  chevron: { fontSize: 24, color: COLORS.muted, marginLeft: SPACING.sm },

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
  detailIcon: { fontSize: 70, marginBottom: SPACING.sm },
  detailName: {
    fontSize: 22,
    color: COLORS.cream,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  detailDeity: { fontSize: 14, color: COLORS.gold, marginBottom: SPACING.sm },
  detailDate: { fontSize: 12, color: COLORS.muted },

  panchangCard: {
    margin: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
  },
  panchangTitle: {
    fontSize: 11,
    color: COLORS.gold,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  panchangGrid: { gap: SPACING.sm },
  panchangRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  panchangRowLabel: { fontSize: 12, color: COLORS.muted },
  panchangRowValue: { fontSize: 13, color: COLORS.cream, fontWeight: '500' },

  section: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  bodyText: {
    fontSize: 13,
    color: COLORS.cream,
    lineHeight: 20,
  },
  timingCard: {
    marginHorizontal: SPACING.md,
    backgroundColor: 'rgba(255, 140, 66, 0.1)',
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.saffron,
  },
  timingLabel: { fontSize: 12, color: COLORS.saffron, fontWeight: '600', marginBottom: 4 },
  timingValue: { fontSize: 13, color: COLORS.cream },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  taskBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(212, 160, 23, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
    marginTop: 1,
  },
  taskBulletText: { fontSize: 11, color: COLORS.gold, fontWeight: '700' },
  taskText: { flex: 1, fontSize: 13, color: COLORS.cream, lineHeight: 20 },
  checklistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  progressText: { fontSize: 12, color: COLORS.leaf },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.gold,
    marginRight: SPACING.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: COLORS.gold },
  checkmark: { color: COLORS.deep, fontSize: 12, fontWeight: 'bold' },
  checkText: { flex: 1, fontSize: 13, color: COLORS.cream },
  checkTextDone: { color: COLORS.muted, textDecorationLine: 'line-through' },
  checkTag: { fontSize: 16, marginLeft: SPACING.sm },
  wishCard: {
    marginHorizontal: SPACING.md,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  wishMain: {
    fontSize: 14,
    color: COLORS.cream,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 4,
  },
  wishSub: { fontSize: 12, color: COLORS.gold },
});
