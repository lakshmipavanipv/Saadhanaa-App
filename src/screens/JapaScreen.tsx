import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  FlatList,
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

  const tap = useCallback(() => {
    setCount(c => {
      setPopBead(c);
      setTimeout(() => setPopBead(-1), 280);
      const next = c + 1;
      if (next >= BEADS) {
        setMalas(m => m + 1);
        return 0;
      }
      return next;
    });
  }, []);

  const saveSession_internal = () => {
    if (malas === 0 && count === 0) {
      showToast('Nothing to save yet!');
      return;
    }
    const totalM = malas + (count > 0 ? 1 : 0);
    if (!selectedDeity) {
      showToast('Please select a deity first!');
      return;
    }
    saveSession({
      deity: selectedDeity.name,
      deityId: selectedDeity.id,
      malas: totalM,
      japas: totalM * 108,
      date: todayStr(),
    });
    setCount(0);
    setMalas(0);
    showToast(`${totalM} mala${totalM > 1 ? 's' : ''} saved for ${selectedDeity.name}!`);
  };

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

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.primaryBtn} onPress={tap}>
            <Text style={styles.primaryBtnText}>+ 1 Japa</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={saveSession_internal}>
            <Text style={styles.secondaryBtnText}>💾</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={reset}>
            <Text style={styles.secondaryBtnText}>↺</Text>
          </TouchableOpacity>
        </View>
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
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: COLORS.deep,
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryBtn: {
    width: 50,
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: {
    fontSize: 18,
  },
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
