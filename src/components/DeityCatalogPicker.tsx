import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import { DEITY_CATALOG, CatalogDeity } from '../deityCatalog';
import { COLORS, SPACING } from '../theme';
import { DeityIcon } from './DeityIcon';

interface DeityCatalogPickerProps {
  pickedIds: Set<string>;
  onTogglePick: (deity: CatalogDeity) => void;
  searchPlaceholder?: string;
  showCustom?: boolean;
  onAddCustom?: (name: string, icon: string, mantra: string) => void;
}

const QUICK_ICONS = [
  '🙏', '🐘', '🪈', '🌺', '⚡', '🔱', '🦚', '🌙', '☀️', '🪷',
  '🐍', '🦁', '🔔', '🌊', '🕉️', '🪔', '🐂', '🦅', '🌸', '🏔️',
  '🌹', '🦌', '🪘', '🌟', '💃', '⚔️', '🌿', '🛕', '🍃', '🔥',
];

export const DeityCatalogPicker: React.FC<DeityCatalogPickerProps> = ({
  pickedIds,
  onTogglePick,
  searchPlaceholder = 'Search deities…',
  showCustom = true,
  onAddCustom,
}) => {
  const [search, setSearch] = useState('');
  const [openGroup, setOpenGroup] = useState<string | null>('main');
  const [customName, setCustomName] = useState('');
  const [customMantra, setCustomMantra] = useState('');
  const [customIcon, setCustomIcon] = useState('🙏');

  const filtered = useMemo(() => {
    if (!search.trim()) return DEITY_CATALOG;
    const q = search.toLowerCase();
    return DEITY_CATALOG
      .map(g => ({
        ...g,
        deities: g.deities.filter(
          d =>
            d.name.toLowerCase().includes(q) ||
            (d.iconography || '').toLowerCase().includes(q) ||
            d.mantra.toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.deities.length > 0);
  }, [search]);

  const handleAddCustom = () => {
    if (!customName.trim() || !onAddCustom) return;
    onAddCustom(customName.trim(), customIcon, customMantra.trim() || 'Om Namah');
    setCustomName('');
    setCustomMantra('');
    setCustomIcon('🙏');
  };

  return (
    <View>
      {/* Search */}
      <View style={styles.searchBox}>
        <Text style={{ fontSize: 16, marginRight: SPACING.sm, color: COLORS.muted }}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={searchPlaceholder}
          placeholderTextColor={COLORS.muted}
        />
      </View>

      {/* Picked count */}
      <Text style={styles.pickedCount}>
        {pickedIds.size} deities selected
      </Text>

      {/* Groups */}
      {filtered.map(group => {
        const isOpen = search.trim() !== '' || openGroup === group.id;
        return (
          <View key={group.id} style={styles.group}>
            <TouchableOpacity
              style={styles.groupHeader}
              onPress={() => setOpenGroup(openGroup === group.id ? null : group.id)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <Text style={styles.groupSubtitle}>{group.subtitle}</Text>
              </View>
              <Text style={styles.groupChevron}>{isOpen ? '▾' : '▸'}</Text>
            </TouchableOpacity>

            {isOpen && (
              <View style={styles.deitiesGrid}>
                {group.deities.map(d => {
                  const isPicked = pickedIds.has(d.id);
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[
                        styles.deityCard,
                        isPicked && styles.deityCardPicked,
                      ]}
                      onPress={() => onTogglePick(d)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.iconCircle, isPicked && styles.iconCirclePicked]}>
                        <DeityIcon
                          deityId={d.id}
                          icon={d.icon}
                          size={30}
                          color={isPicked ? COLORS.gold : COLORS.cream}
                        />
                        {isPicked && (
                          <View style={styles.tickBadge}>
                            <Text style={styles.tickText}>✓</Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[styles.deityName, isPicked && styles.deityNamePicked]}
                        numberOfLines={1}
                      >
                        {d.name}
                      </Text>
                      <Text style={styles.deityMantra} numberOfLines={1}>
                        {d.mantra}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}

      {/* Custom deity */}
      {showCustom && onAddCustom && (
        <View style={styles.customSection}>
          <Text style={styles.customTitle}>+ Add your own deity</Text>
          <Text style={styles.customHint}>
            Not in the list? Add a personal Ishta Devata or family deity.
          </Text>

          <TextInput
            style={styles.input}
            value={customName}
            onChangeText={setCustomName}
            placeholder="Deity name (e.g. Sri Mahaganapathi, Sai Baba)"
            placeholderTextColor={COLORS.muted}
          />
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            value={customMantra}
            onChangeText={setCustomMantra}
            placeholder="Mantra (optional)"
            placeholderTextColor={COLORS.muted}
          />

          <Text style={styles.iconLabel}>Choose icon</Text>
          <View style={styles.iconRow}>
            {QUICK_ICONS.map(ic => (
              <TouchableOpacity
                key={ic}
                style={[
                  styles.iconBtn,
                  customIcon === ic && styles.iconBtnActive,
                ]}
                onPress={() => setCustomIcon(ic)}
              >
                <Text style={{ fontSize: 20 }}>{ic}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[
              styles.addCustomBtn,
              !customName.trim() && styles.addCustomBtnDisabled,
            ]}
            onPress={handleAddCustom}
            disabled={!customName.trim()}
          >
            <Text style={styles.addCustomBtnText}>
              + Add {customIcon} {customName.trim() || 'this deity'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    color: COLORS.cream,
    fontSize: 14,
    paddingVertical: SPACING.sm,
  },
  pickedCount: {
    fontSize: 11,
    color: COLORS.gold,
    fontWeight: '600',
    marginBottom: SPACING.md,
    letterSpacing: 1,
  },
  group: { marginBottom: SPACING.sm },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 160, 23, 0.08)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
  },
  groupTitle: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  groupSubtitle: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 2,
  },
  groupChevron: { fontSize: 16, color: COLORS.gold },

  deitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: SPACING.md,
  },
  deityCard: {
    width: '48%',
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.sm,
    borderWidth: 2,
    borderColor: 'rgba(212, 160, 23, 0.12)',
  },
  deityCardPicked: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(212, 160, 23, 0.08)',
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(212, 160, 23, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.25)',
    position: 'relative',
  },
  iconCirclePicked: {
    backgroundColor: 'rgba(212, 160, 23, 0.2)',
    borderColor: COLORS.gold,
  },
  deityIcon: { fontSize: 30 },
  tickBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.deep,
  },
  tickText: { color: COLORS.deep, fontSize: 11, fontWeight: '700' },
  deityName: {
    fontSize: 12,
    color: COLORS.cream,
    fontWeight: '600',
    textAlign: 'center',
  },
  deityNamePicked: { color: COLORS.gold },
  deityMantra: {
    fontSize: 10,
    color: COLORS.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 2,
  },
  deityIconography: {
    fontSize: 9,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 12,
  },

  customSection: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  customTitle: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  customHint: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: SPACING.sm,
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: COLORS.deep,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 10,
    color: COLORS.cream,
    fontSize: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconLabel: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: SPACING.sm,
    marginBottom: 4,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  iconRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: SPACING.sm,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(212, 160, 23, 0.15)',
  },
  iconBtnActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
  },
  addCustomBtn: {
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold,
    marginTop: 4,
  },
  addCustomBtnDisabled: { opacity: 0.4 },
  addCustomBtnText: { color: COLORS.gold, fontSize: 13, fontWeight: '600' },
});
