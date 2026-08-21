/**
 * JapaHistoryDetailScreen — the full list of japa sessions.
 *
 * The History tab used to render every session inline, which buried the
 * summary charts under a list nobody scrolls to the end of. History now shows
 * a few recent entries and a button through to here, the same pattern the
 * Health tab uses for per-metric readings.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT_SIZES } from '../theme';
import { useTheme } from '../ThemeContext';
import { useSadhana } from '../context';

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
};

export const JapaHistoryDetailScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { palette } = useTheme();
  const { history } = useSadhana();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  // Newest first — a log is read from the most recent entry backwards.
  const sessions = useMemo(
    () => [...history].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [history]
  );

  const totalMalas = sessions.reduce((s, h) => s + (h.malas ?? 0), 0);
  const totalJapas = sessions.reduce((s, h) => s + (h.japas ?? 0), 0);

  return (
    <View style={[styles.container, { backgroundColor: palette.deep }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation?.navigate?.('History')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>📿  All japa sessions</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {sessions.length} session{sessions.length === 1 ? '' : 's'} ·{' '}
            {totalMalas.toLocaleString()} malas · {totalJapas.toLocaleString()} japas
          </Text>
        </View>

        {sessions.length === 0 ? (
          <Text style={styles.empty}>No japa sessions saved yet.</Text>
        ) : (
          sessions.map((entry, i) => (
            <View key={entry.id || `${entry.date}-${i}`} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowDate}>{formatDate(entry.date)}</Text>
                <Text style={styles.rowDeity}>{entry.deity}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.rowMalas}>{entry.malas} malas</Text>
                <Text style={styles.rowJapas}>{entry.japas} japas</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.lg, paddingBottom: SPACING.sm,
  },
  back: { color: C.gold, fontSize: 34, marginRight: SPACING.sm, lineHeight: 36 },
  title: { color: C.cream, fontSize: FONT_SIZES.lg, fontWeight: '700', flexShrink: 1 },
  content: { paddingHorizontal: SPACING.md, paddingBottom: 80 },
  summary: {
    backgroundColor: C.cardBg, borderColor: C.border, borderWidth: 1,
    borderRadius: 14, padding: SPACING.md, marginBottom: SPACING.md,
  },
  summaryText: { color: C.muted, fontSize: 13 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  rowDate: { color: C.cream, fontSize: 14, fontWeight: '600' },
  rowDeity: { color: C.muted, fontSize: 12, marginTop: 2 },
  rowMalas: { color: C.gold, fontSize: 14, fontWeight: '700' },
  rowJapas: { color: C.muted, fontSize: 11, marginTop: 2 },
  empty: { color: C.muted, fontSize: 13, paddingVertical: SPACING.lg, textAlign: 'center' },
});
