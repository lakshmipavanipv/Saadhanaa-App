/**
 * ThemePicker — modal presenting Light / Dark options with a preview swatch.
 * Persists via ThemeContext.setMode.
 */

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, COLORS_LIGHT } from '../theme';
import { useTheme } from '../ThemeContext';
import { paletteFor } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const ThemePicker: React.FC<Props> = ({ visible, onClose }) => {
  const { mode, setMode, palette } = useTheme();

  const Row: React.FC<{ label: string; value: 'light' | 'dark'; preview: typeof COLORS }> = ({
    label, value, preview,
  }) => {
    const selected = mode === value;
    return (
      <TouchableOpacity
        style={[styles.row, selected && styles.rowSelected]}
        onPress={() => { setMode(value); }}
      >
        <View style={[styles.swatch, { backgroundColor: preview.deep, borderColor: preview.border }]}>
          <View style={[styles.swatchCard, { backgroundColor: preview.cardBg }]}>
            <View style={[styles.swatchDot, { backgroundColor: preview.gold }]} />
            <View style={[styles.swatchLine, { backgroundColor: preview.cream, opacity: 0.6 }]} />
            <View style={[styles.swatchLine, { backgroundColor: preview.cream, opacity: 0.3, width: '60%' }]} />
          </View>
        </View>
        <View style={{ flex: 1, marginLeft: SPACING.md }}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowHint}>{selected ? 'Currently active' : 'Tap to apply'}</Text>
        </View>
        {selected && <Text style={styles.check}>✓</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: palette.darkBg }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.handle, { backgroundColor: palette.muted }]} />
          <Text style={[styles.title, { color: palette.cream }]}>Color Theme</Text>
          <Text style={[styles.hint, { color: palette.muted }]}>Cards, drawer, ring debug, device settings, and health screens follow this immediately. Legacy screens will migrate over time.</Text>

          <Row label="Dark" value="dark" preview={paletteFor('dark')} />
          <Row label="Light" value="light" preview={paletteFor('light')} />

          <TouchableOpacity style={[styles.doneBtn, { backgroundColor: palette.gold }]} onPress={onClose}>
            <Text style={styles.doneTxt}>Done</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.darkBg,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.muted,
    alignSelf: 'center', marginBottom: SPACING.md,
  },
  title: { color: COLORS.cream, fontSize: FONT_SIZES['2xl'], fontWeight: '700', marginBottom: 4 },
  hint: { color: COLORS.muted, fontSize: FONT_SIZES.xs, marginBottom: SPACING.md },

  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1, borderColor: 'transparent',
  },
  rowSelected: { borderColor: COLORS.gold },
  swatch: {
    width: 70, height: 50, borderRadius: 8,
    padding: 6, borderWidth: 1,
  },
  swatchCard: { flex: 1, borderRadius: 4, padding: 4 },
  swatchDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 3 },
  swatchLine: { height: 3, borderRadius: 1, marginBottom: 2, width: '80%' },
  rowLabel: { color: COLORS.cream, fontSize: FONT_SIZES.lg, fontWeight: '600' },
  rowHint: { color: COLORS.muted, fontSize: FONT_SIZES.xs, marginTop: 2 },
  check: { color: COLORS.gold, fontSize: FONT_SIZES['2xl'], fontWeight: '700' },

  doneBtn: {
    marginTop: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.gold,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  doneTxt: { color: '#000', fontSize: FONT_SIZES.base, fontWeight: '700' },
});
