import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { COLORS, SPACING } from '../theme';
import { PanchangFestival } from '../festivalsData';

const { width } = Dimensions.get('window');
const CELL_SIZE = Math.min(48, (width - 32) / 7 - 4);
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface CalendarProps {
  festivals: PanchangFestival[];
  onDatePress: (date: string, fests: PanchangFestival[]) => void;
}

export const Calendar: React.FC<CalendarProps> = ({ festivals, onDatePress }) => {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const festByDate = useMemo(() => {
    const map: Record<string, PanchangFestival[]> = {};
    festivals.forEach(f => {
      if (!map[f.date]) map[f.date] = [];
      map[f.date].push(f);
    });
    return map;
  }, [festivals]);

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay();

  const cells: { day: number | null; dateStr: string; fests: PanchangFestival[] }[] = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ day: null, dateStr: '', fests: [] });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateStr, fests: festByDate[dateStr] || [] });
  }

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goPrev} style={styles.navBtn}>
          <Text style={styles.navText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={goNext} style={styles.navBtn}>
          <Text style={styles.navText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.weekDay}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((c, i) => {
          const isToday = c.dateStr === todayStr;
          const hasFest = c.fests.length > 0;
          return (
            <TouchableOpacity
              key={i}
              style={[
                styles.cell,
                isToday && styles.cellToday,
                hasFest && styles.cellFest,
              ]}
              onPress={() => c.day && onDatePress(c.dateStr, c.fests)}
              disabled={!c.day}
              activeOpacity={c.day ? 0.7 : 1}
            >
              {c.day && (
                <>
                  {hasFest ? (
                    <Text style={styles.festIcon}>{c.fests[0].deityIcon}</Text>
                  ) : (
                    <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>
                      {c.day}
                    </Text>
                  )}
                  {hasFest && (
                    <Text style={styles.dayNumSmall}>{c.day}</Text>
                  )}
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navText: { fontSize: 22, color: COLORS.gold, fontWeight: '600' },
  monthTitle: {
    fontSize: 16,
    color: COLORS.cream,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
  },
  weekDay: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '600',
    flex: 1,            // equal share, matches cell '${100/7}%' width
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  cellToday: {},
  cellFest: {},
  dayNum: {
    fontSize: 13,
    color: COLORS.cream,
  },
  dayNumToday: {
    color: COLORS.gold,
    fontWeight: '700',
    backgroundColor: 'rgba(212, 160, 23, 0.2)',
    width: 28,
    height: 28,
    lineHeight: 28,
    textAlign: 'center',
    borderRadius: 14,
    overflow: 'hidden',
  },
  dayNumSmall: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: -2,
  },
  festIcon: {
    fontSize: 22,
  },
});
