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
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSadhana } from '../context';
import { todayStr } from '../utils';
import { COLORS, SPACING, FONT_SIZES } from '../theme';
import { Mala } from '../components/Mala';
import { DeityIcon } from '../components/DeityIcon';
import { useSoulsyncSession } from '../soulsync/hooks/useSoulsyncSession';
import { HRVWaveGraph } from '../soulsync/components/HRVWaveGraph';
import { BpmJourneyChart } from '../soulsync/components/BpmJourneyChart';
import {
  requestBlePermissions,
  scanForDevices,
  connectAndListen,
  ScannedDevice,
  CounterConnection,
} from '../services/ble';

const BEADS = 108;

export const JapaScreen = ({ navigation }: any) => {
  const { selectedDeity, setSelectedDeity, deities, saveSession, showToast, deityProgress, updateProgress } = useSadhana();
  const [count, setCount] = useState(0);
  const [malas, setMalas] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [popBead, setPopBead] = useState(-1);

  // ── Soulsync ring-telemetry session (mock until hardware arrives) ──
  const soulsync = useSoulsyncSession();

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

  const tap = useCallback(() => {
    if (!selectedDeity) {
      showToast('Please select a deity first!');
      return;
    }
    setPopBead(count);
    setTimeout(() => setPopBead(-1), 280);
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
      if (soulsync.state.active) soulsync.recordMala();
      showToast(`🪷 1 mala saved for ${selectedDeity.name}`);
    } else {
      setCount(next);
      updateProgress(selectedDeity.id, next, malas);
    }
  }, [selectedDeity, saveSession, showToast, count, malas, updateProgress]);

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
              <Text style={styles.deityLabel}>Deity</Text>
              <Text style={styles.deityName}>
                {selectedDeity ? selectedDeity.name : 'Tap to select deity ▾'}
              </Text>
            </View>
          </View>
          <Text style={styles.chevron}>▾</Text>
        </TouchableOpacity>

        {/* Circular Mala */}
        <Mala
          count={count}
          malas={malas}
          onTap={tap}
          popBead={popBead}
          beadColor={selectedDeity?.malaColor}
          beadHighlight={selectedDeity?.malaHighlight}
          materialName={selectedDeity?.malaMaterial}
        />

        {/* Mantra display */}
        {selectedDeity?.mantra && (
          <Text style={styles.mantra}>“{selectedDeity.mantra}”</Text>
        )}

        {/* Soulsync session toggle */}
        <View style={styles.soulsyncRow}>
          <TouchableOpacity
            style={[styles.soulsyncBtn, soulsync.state.active && styles.soulsyncBtnOn]}
            onPress={() => soulsync.state.active ? soulsync.stop() : soulsync.start()}
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

        {/* Live HRV wave + glowing peak markers (only during an active session) */}
        {soulsync.state.active && (
          <HRVWaveGraph
            bpmSeries={soulsync.state.bpmSeries}
            peakIndices={soulsync.state.peakIndices}
            rmssd={soulsync.state.rmssd}
            improvementPct={soulsync.state.improvementPct}
            isBaselineEstablished={soulsync.state.isBaselineEstablished}
          />
        )}

        {/* 3-phase BPM Journey — Pre / During / Post Japa */}
        <BpmJourneyChart />

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
            <Text style={styles.manualBtnText}>+ Log past</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bleBtn, connection && styles.bleBtnConnected]}
            onPress={handleBlePress}
          >
            <View style={[styles.bleDot, connection && styles.bleDotOn]} />
            <Text style={[styles.bleBtnText, connection && styles.bleBtnTextOn]}>
              {connection ? 'BLE on' : 'Pair BLE'}
            </Text>
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
              <Text style={styles.modalTitle}>Pair BLE counter</Text>
              {scanning && <ActivityIndicator color={COLORS.gold} style={{ marginLeft: 12 }} />}
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
                    <ActivityIndicator color={COLORS.gold} />
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
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: 'rgba(214, 224, 64, 0.4)',
  },
  soulsyncBtnOn: {
    backgroundColor: 'rgba(214, 224, 64, 0.15)',
    borderColor: '#d6e040',
  },
  soulsyncDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.muted,
  },
  soulsyncDotOn: {
    backgroundColor: '#d6e040',
    shadowColor: '#d6e040',
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 6,
  },
  soulsyncText: { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
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
  bleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.4)',
  },
  bleBtnConnected: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    borderColor: COLORS.leaf,
  },
  bleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.muted,
  },
  bleDotOn: {
    backgroundColor: COLORS.leaf,
    shadowColor: COLORS.leaf,
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 4,
  },
  bleBtnText: { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
  bleBtnTextOn: { color: COLORS.leaf },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    marginBottom: 6,
  },
  deviceName: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  deviceMeta: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  connectArrow: { fontSize: 12, color: COLORS.gold, fontWeight: '600' },
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
    borderColor: COLORS.gold,
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
    color: COLORS.gold,
    fontWeight: '700',
    lineHeight: 24,
  },
  addDeityName: {
    fontSize: 15,
    color: COLORS.gold,
    fontWeight: '700',
  },
  addDeityHint: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
    fontStyle: 'italic',
  },
  addDeityArrow: {
    fontSize: 22,
    color: COLORS.gold,
    fontWeight: '600',
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
