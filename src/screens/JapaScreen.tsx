import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { useSadhana } from '../context';
import { todayStr } from '../utils';
import { COLORS, SPACING, FONT_SIZES } from '../theme';
import { Mala } from '../components/Mala';

const BEADS = 108;

export const JapaScreen = () => {
  const { selectedDeity, setSelectedDeity, deities, saveSession, showToast } = useSadhana();
  const [count, setCount] = useState(0);
  const [malas, setMalas] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [popBead, setPopBead] = useState(-1);
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

  const tap = useCallback(() => {
    if (!selectedDeity) {
      showToast('Please select a deity first!');
      return;
    }
    setCount(c => {
      setPopBead(c);
      setTimeout(() => setPopBead(-1), 280);
      const next = c + 1;
      if (next >= BEADS) {
        // Auto-save on mala completion
        saveSession({
          deity: selectedDeity.name,
          deityId: selectedDeity.id,
          malas: 1,
          japas: 108,
          date: todayStr(),
        });
        setMalas(m => m + 1);
        showToast(`🪷 1 mala saved for ${selectedDeity.name}`);
        return 0;
      }
      return next;
    });
  }, [selectedDeity, saveSession, showToast]);

  const reset = () => {
    setCount(0);
    setMalas(0);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Japa Counter</Text>
          <Text style={styles.subtitle}>1 Mala = 108 Japas · Tap the circle to count</Text>
        </View>

        {/* Deity Selector */}
        <TouchableOpacity
          style={styles.deitySelector}
          onPress={() => setShowPicker(true)}
        >
          <View>
            <Text style={styles.deityLabel}>Deity</Text>
            <Text style={styles.deityName}>
              {selectedDeity
                ? `${selectedDeity.icon} ${selectedDeity.name}`
                : 'Tap to select deity ▾'}
            </Text>
          </View>
          <Text style={styles.chevron}>▾</Text>
        </TouchableOpacity>

        {/* Circular Mala */}
        <Mala count={count} malas={malas} onTap={tap} popBead={popBead} />

        {/* Mantra display */}
        {selectedDeity?.mantra && (
          <Text style={styles.mantra}>“{selectedDeity.mantra}”</Text>
        )}

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCol}>
            <Text style={styles.statValue}>{malas * 108 + count}</Text>
            <Text style={styles.statLabel}>Total Japas</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <Text style={styles.statValue}>
              {Math.round(((malas * 108 + count) / 108) * 100) / 100}
            </Text>
            <Text style={styles.statLabel}>Malas</Text>
          </View>
        </View>

        {/* Controls — auto-save on mala completion */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.resetBtn} onPress={reset}>
            <Text style={styles.resetBtnText}>↺ Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.manualBtn} onPress={() => setShowManual(true)}>
            <Text style={styles.manualBtnText}>+ Log past japas</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.autoSaveHint}>
          Tap the center bead · 1 mala (108 beads) saves automatically
        </Text>
      </ScrollView>

      {/* Deity Picker Modal */}
      <Modal visible={showPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Choose Deity</Text>
            {deities.length === 0 ? (
              <Text style={styles.emptyText}>
                No deities yet. Go to the Deities tab to add some.
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
                    <Text style={styles.deityPickerIcon}>{d.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deityPickerName}>{d.name}</Text>
                      <Text style={styles.deityPickerMantra}>{d.mantra}</Text>
                    </View>
                    {selectedDeity?.id === d.id && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowPicker(false)}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.deep,
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
    color: COLORS.cream,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
  },
  deitySelector: {
    backgroundColor: COLORS.cardBg,
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
    color: COLORS.muted,
    marginBottom: 4,
  },
  deityName: {
    fontSize: 16,
    color: COLORS.cream,
    fontWeight: '500',
  },
  chevron: {
    fontSize: 16,
    color: COLORS.muted,
  },
  mantra: {
    fontSize: 14,
    color: COLORS.gold,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
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
    color: COLORS.gold,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
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
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  resetBtnText: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '500',
  },
  manualBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  manualBtnText: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: '600',
  },
  autoSaveHint: {
    fontSize: 11,
    color: COLORS.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  fieldLabel: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  fieldHint: {
    fontSize: 11,
    color: COLORS.gold,
    marginTop: 4,
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: COLORS.cream,
    fontSize: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  primaryBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  primaryBtnText: { color: COLORS.deep, fontWeight: '700', fontSize: 14 },
  cancelBtn: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  cancelBtnText: { color: COLORS.muted, fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.darkBg,
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
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: 18,
    color: COLORS.cream,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 14,
    paddingVertical: SPACING.lg,
  },
  deityPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
  deityPickerName: {
    fontSize: 15,
    color: COLORS.cream,
    fontWeight: '500',
  },
  deityPickerMantra: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
    fontStyle: 'italic',
  },
  checkmark: {
    fontSize: 18,
    color: COLORS.gold,
  },
  closeBtn: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  closeBtnText: {
    color: COLORS.cream,
    fontSize: 14,
    fontWeight: '500',
  },
});
