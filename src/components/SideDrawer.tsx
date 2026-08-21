/**
 * SideDrawer — slide-in navigation panel from the left edge. Opened by the
 * hamburger icon at the top of the app. Groups menu items into logical
 * sections; each item either navigates to a bottom-tab route or opens a
 * dedicated modal screen.
 *
 * Uses a Modal + translucent overlay so we don't have to add
 * @react-navigation/drawer (which needs a native rebuild).
 */

import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../theme';
import { useSadhana } from '../context';
import { useTheme } from '../ThemeContext';

const SCREEN_W = Dimensions.get('window').width;
const DRAWER_W = Math.min(320, SCREEN_W * 0.82);

export interface DrawerAction {
  key: string;
  navigate?: string;    // bottom-tab route name
  openModal?: 'settings' | 'ringDebug' | 'deviceSettings' | 'aiInsights' | 'themePicker';
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (action: DrawerAction) => void;
}

interface MenuItem {
  icon: string;
  label: string;
  action: DrawerAction;
  hint?: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const SECTIONS: MenuSection[] = [
  {
    title: 'You',
    items: [
      { icon: '👤', label: 'Profile & Personal Info', action: { key: 'profile', openModal: 'settings' }, hint: 'Name · email · age · height · weight' },
      { icon: '📊', label: 'Historical Reports', action: { key: 'reports', navigate: 'History' }, hint: 'Trends, insights, all metrics' },
      { icon: '🤖', label: 'AI Intelligence', action: { key: 'ai', openModal: 'aiInsights' }, hint: 'Personalized recommendations' },
    ],
  },
  {
    title: 'Sadhana',
    items: [
      { icon: '🎯', label: 'Plan Your Wellbeing', action: { key: 'plan', navigate: 'Plan' }, hint: 'Daily plan, goals, routines' },
      { icon: '🛕', label: 'Panchang & Festivals', action: { key: 'panchang', navigate: 'Panchang' }, hint: 'Tithi, festival reminders' },
      // Health Dashboard removed: Health is a bottom tab, so a drawer entry
      // pointing at the same place was a second door to one room.
    ],
  },
  {
    title: 'Ring & Device',
    items: [
      { icon: '💍', label: 'Device Settings', action: { key: 'device', openModal: 'deviceSettings' }, hint: 'All ring settings — like RWfit' },
      { icon: '⏰', label: 'Reminders & Notifications', action: { key: 'reminders', navigate: 'Reminders' }, hint: 'Alarms · sedentary · drink · DND · push' },
      { icon: '📶', label: 'Bluetooth / Pair Ring', action: { key: 'ble', openModal: 'ringDebug' }, hint: 'Scan, connect, live BLE frames' },
    ],
  },
  {
    title: 'App',
    items: [
      // Color Theme removed: Device Settings already owns this control, and
      // two entry points for one setting invite them to disagree.
    ],
  },
];

export const SideDrawer: React.FC<Props> = ({ visible, onClose, onSelect }) => {
  const { userProfile } = useSadhana();
  const { palette } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.drawer, { backgroundColor: palette.deep, borderRightColor: palette.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: palette.border }]}>
            <View style={[styles.avatar, { backgroundColor: palette.gold }]}>
              <Text style={styles.avatarLetter}>
                {(userProfile?.name?.charAt(0) ?? 'U').toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.userName, { color: palette.cream }]}>{userProfile?.name ?? 'Sadhak'}</Text>
            {userProfile?.email && <Text style={[styles.userEmail, { color: palette.muted }]}>{userProfile.email}</Text>}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
            {SECTIONS.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={[styles.sectionTitle, { color: palette.gold }]}>{section.title.toUpperCase()}</Text>
                {section.items.map((item) => (
                  <TouchableOpacity
                    key={item.action.key}
                    style={styles.item}
                    onPress={() => { onSelect(item.action); onClose(); }}
                  >
                    <Text style={styles.itemIcon}>{item.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemLabel, { color: palette.cream }]}>{item.label}</Text>
                      {item.hint && <Text style={[styles.itemHint, { color: palette.muted }]}>{item.hint}</Text>}
                    </View>
                    <Text style={[styles.chev, { color: palette.muted }]}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}

            <Text style={[styles.footer, { color: palette.muted }]}>Body & Soul Ring · v1.0.75</Text>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  drawer: {
    width: DRAWER_W, height: '100%',
    backgroundColor: COLORS.deep,
    borderRightWidth: 1, borderRightColor: COLORS.border,
    paddingTop: SPACING.xl + SPACING.md,
  },
  header: {
    padding: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    alignItems: 'center',
  },
  avatar: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: COLORS.gold,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  avatarLetter: { color: '#000', fontSize: FONT_SIZES['2xl'], fontWeight: '700' },
  userName: { color: COLORS.cream, fontSize: FONT_SIZES.lg, fontWeight: '600' },
  userEmail: { color: COLORS.muted, fontSize: FONT_SIZES.xs, marginTop: 2 },

  section: { marginTop: SPACING.md, marginBottom: SPACING.xs },
  sectionTitle: {
    color: COLORS.gold, fontSize: FONT_SIZES.xs, fontWeight: '700',
    letterSpacing: 1, marginHorizontal: SPACING.md, marginBottom: SPACING.xs,
  },
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
  },
  itemIcon: { fontSize: FONT_SIZES.xl, marginRight: SPACING.sm, width: 32 },
  itemLabel: { color: COLORS.cream, fontSize: FONT_SIZES.base, fontWeight: '500' },
  itemHint: { color: COLORS.muted, fontSize: FONT_SIZES.xs, marginTop: 1 },
  chev: { color: COLORS.muted, fontSize: FONT_SIZES.xl, marginLeft: SPACING.xs },

  footer: {
    color: COLORS.muted, fontSize: FONT_SIZES.xs,
    textAlign: 'center', marginTop: SPACING.lg, paddingHorizontal: SPACING.md,
  },
});
