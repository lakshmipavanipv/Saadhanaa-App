import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAudioPlayer } from 'expo-audio';
import { ALARM_SOUNDS, findSound, DEFAULT_SOUND_ID } from '../sounds';
import { COLORS, SPACING } from '../theme';

export interface AlarmSoundValue {
  /** preset id ('flute', 'bell', etc.) OR 'custom' when a device file is selected */
  id: string;
  /** when id === 'custom', the file:// URI of the chosen file */
  customUri?: string;
  /** display name (for custom: chosen filename) */
  customName?: string;
}

interface Props {
  value: AlarmSoundValue;
  onChange: (v: AlarmSoundValue) => void;
}

export const AlarmSoundPicker: React.FC<Props> = ({ value, onChange }) => {
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const previewSound = findSound(
    previewingId === 'custom'
      ? undefined
      : previewingId || undefined
  );
  const previewSource =
    previewingId === 'custom'
      ? value.customUri
        ? { uri: value.customUri }
        : null
      : previewSound?.module;

  const player = useAudioPlayer(previewSource || null);

  const handleSelect = (id: string) => {
    onChange({ ...value, id });
    setPreviewingId(id);
    if (id !== 'custom') {
      const s = findSound(id);
      if (s?.module && player) {
        try {
          player.seekTo(0);
          player.play();
        } catch {
          // ignore playback errors (missing file etc.)
        }
      }
    }
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      onChange({
        id: 'custom',
        customUri: asset.uri,
        customName: asset.name,
      });
    } catch (e) {
      console.warn('Document pick failed', e);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎵 Alarm Sound</Text>

      {ALARM_SOUNDS.map((s, idx) => {
        const isSelected = value.id === s.id;
        const isDefault = s.id === DEFAULT_SOUND_ID;
        return (
          <TouchableOpacity
            key={s.id}
            style={[styles.row, isSelected && styles.rowActive]}
            onPress={() => handleSelect(s.id)}
            activeOpacity={0.8}
          >
            <View style={[styles.radio, isSelected && styles.radioActive]}>
              {isSelected && <View style={styles.radioDot} />}
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.sm }}>
              <Text style={[styles.label, isSelected && styles.labelActive]}>
                {s.label}
                {isDefault && <Text style={styles.defaultBadge}>  (Default)</Text>}
              </Text>
              {s.description && (
                <Text style={styles.description}>{s.description}</Text>
              )}
            </View>
            {!s.module && (
              <Text style={styles.missing}>missing</Text>
            )}
          </TouchableOpacity>
        );
      })}

      <View style={styles.divider} />

      {/* Custom file picker */}
      <TouchableOpacity
        style={[styles.row, value.id === 'custom' && styles.rowActive]}
        onPress={handlePickFile}
        activeOpacity={0.8}
      >
        <View style={[styles.radio, value.id === 'custom' && styles.radioActive]}>
          {value.id === 'custom' && <View style={styles.radioDot} />}
        </View>
        <View style={{ flex: 1, marginLeft: SPACING.sm }}>
          <Text style={[styles.label, value.id === 'custom' && styles.labelActive]}>
            ➕ Choose from device
          </Text>
          <Text style={styles.description}>
            {value.customName || '.mp3, .wav, .m4a'}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: 12,
    color: COLORS.gold,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  rowActive: {
    backgroundColor: 'rgba(212, 160, 23, 0.1)',
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: COLORS.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioActive: { borderColor: COLORS.gold },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: COLORS.gold,
  },
  label: {
    fontSize: 13,
    color: COLORS.cream,
    fontWeight: '500',
  },
  labelActive: {
    color: COLORS.gold,
    fontWeight: '600',
  },
  defaultBadge: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '400',
    fontStyle: 'italic',
  },
  description: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
  missing: {
    fontSize: 10,
    color: COLORS.error,
    fontStyle: 'italic',
    marginLeft: SPACING.sm,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 4,
  },
});
