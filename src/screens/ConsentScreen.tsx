/**
 * ConsentScreen — first-launch DPDP (India, 2023) consent gate.
 *
 * Shows an itemised notice of what we collect + why, takes explicit
 * affirmative consent, and lets the user opt in/out of sensitive health data
 * separately. Nothing is collected until consent is granted (see telemetry.ts).
 *
 * NOTE: this is a product implementation, not legal advice — have the wording
 * + privacy policy reviewed by a lawyer for DPDP compliance before launch.
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet, Linking } from 'react-native';
import { COLORS, SPACING } from '../theme';
import { consentRepo } from '../services/consentRepo';

const PRIVACY_URL = 'https://velvue.in/body-soul-privacy';   // host your policy here
const GRIEVANCE_EMAIL = 'saadhanaring@velvue.in';

const ITEMS: Array<{ icon: string; title: string; body: string }> = [
  { icon: '🪪', title: 'Identity & contact', body: 'Your name, email and phone (from Google or manual sign-in).' },
  { icon: '📱', title: 'Account & device', body: 'Sign-in method, device model, app version, timestamps.' },
  { icon: '📊', title: 'Usage & diagnostics', body: 'Screens visited, features used, session frequency, crashes, issues you report.' },
  { icon: '📿', title: 'Spiritual practice', body: 'Your chosen deities, japa counts & rate, sadhana / meditation / yoga minutes.' },
  { icon: '❤️', title: 'Health & wellness (sensitive)', body: 'Heart rate, HRV, SpO₂, steps, calories, sleep from your ring / phone. Optional — toggle below.' },
];

export const ConsentScreen: React.FC<{ onAgree: () => void }> = ({ onAgree }) => {
  const [shareHealth, setShareHealth] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const proceed = async () => {
    if (!agreed) return;
    setSaving(true);
    await consentRepo.save({
      granted: true,
      categories: { identity: true, usage: true, spiritual: true, health: shareHealth },
    });
    setSaving(false);
    onAgree();
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Your privacy & consent</Text>
        <Text style={s.sub}>
          Body &amp; Soul personalises your practice using the data below. We ask your
          consent first, as required by India's Digital Personal Data Protection Act, 2023.
        </Text>

        {ITEMS.map(it => (
          <View key={it.title} style={s.item}>
            <Text style={s.itemIcon}>{it.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitle}>{it.title}</Text>
              <Text style={s.itemBody}>{it.body}</Text>
            </View>
          </View>
        ))}

        <Text style={s.section}>WHY WE COLLECT IT</Text>
        <Text style={s.why}>
          To run the app · personalise your AI plans &amp; insights · improve the app ·
          anonymised analytics · respond to support. We do <Text style={{ fontWeight: '800' }}>not sell</Text> your data.
        </Text>

        {/* Sensitive health opt-in */}
        <View style={s.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLabel}>Share my health &amp; vitals data</Text>
            <Text style={s.toggleHint}>Powers personalised health insights. You can turn this off and still use the app.</Text>
          </View>
          <Switch
            value={shareHealth}
            onValueChange={setShareHealth}
            trackColor={{ false: COLORS.border, true: COLORS.gold }}
            thumbColor={shareHealth ? COLORS.cream : COLORS.muted}
          />
        </View>

        <Text style={s.rights}>
          Your rights: access · correct · delete your account &amp; data · withdraw consent anytime
          (Settings → Privacy) · raise a grievance. Data is stored on our secure server; retained
          until you delete your account. You must be 18+ (or a guardian consents).
        </Text>
        <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}>
          <Text style={s.link}>Read the full Privacy Policy ↗</Text>
        </TouchableOpacity>
        <Text style={s.grievance}>Grievance Officer: {GRIEVANCE_EMAIL}</Text>

        {/* Master agree */}
        <TouchableOpacity style={s.agreeRow} onPress={() => setAgreed(a => !a)} activeOpacity={0.7}>
          <Text style={[s.checkbox, agreed && s.checkboxOn]}>{agreed ? '☑' : '☐'}</Text>
          <Text style={s.agreeText}>
            I have read and agree to the collection &amp; use of my data as described above.
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.btn, (!agreed || saving) && { opacity: 0.45 }]}
          onPress={proceed}
          disabled={!agreed || saving}
        >
          <Text style={s.btnText}>Agree &amp; continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.deep },
  scroll: { padding: SPACING.lg, paddingTop: 56, paddingBottom: 24 },
  title: { color: COLORS.cream, fontSize: 24, fontWeight: '800' },
  sub: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: SPACING.lg },
  item: { flexDirection: 'row', gap: 12, marginBottom: SPACING.md },
  itemIcon: { fontSize: 22, width: 28 },
  itemTitle: { color: COLORS.cream, fontSize: 15, fontWeight: '700' },
  itemBody: { color: COLORS.muted, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  section: { color: COLORS.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: SPACING.sm, marginBottom: 6 },
  why: { color: COLORS.cream, fontSize: 13, lineHeight: 19 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: SPACING.lg,
    backgroundColor: COLORS.cardBg, borderRadius: 12, padding: SPACING.md,
    borderWidth: 1, borderColor: 'rgba(255,107,107,0.30)',
  },
  toggleLabel: { color: COLORS.cream, fontSize: 14, fontWeight: '700' },
  toggleHint: { color: COLORS.muted, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  rights: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: SPACING.lg },
  link: { color: COLORS.gold, fontSize: 13, fontWeight: '700', marginTop: SPACING.sm },
  grievance: { color: COLORS.muted, fontSize: 11.5, marginTop: 6, fontStyle: 'italic' },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: SPACING.lg },
  checkbox: { color: COLORS.muted, fontSize: 22, lineHeight: 24 },
  checkboxOn: { color: COLORS.gold },
  agreeText: { flex: 1, color: COLORS.cream, fontSize: 13, lineHeight: 19 },
  footer: { padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.deep },
  btn: { backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnText: { color: COLORS.deep, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});
