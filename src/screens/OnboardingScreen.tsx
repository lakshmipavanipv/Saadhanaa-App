import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSadhana } from '../context';
import { DEFAULT_DEITIES, ICONS } from '../constants';
import { Deity, UserProfile } from '../types';
import { COLORS, SPACING } from '../theme';

type Step = 'welcome' | 'identity' | 'deities' | 'done';

const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const validPhone = (s: string) => /^\+?\d[\d\s-]{6,}$/.test(s.trim());

export const OnboardingScreen = () => {
  const { setUserProfile, setDeities, showToast } = useSadhana();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [contactType, setContactType] = useState<'email' | 'phone'>('email');

  // Pre-selected default deities the user can toggle
  const [pickedIds, setPickedIds] = useState<Set<string>>(
    new Set(DEFAULT_DEITIES.map(d => d.id))
  );
  const [customName, setCustomName] = useState('');
  const [customMantra, setCustomMantra] = useState('');
  const [customIcon, setCustomIcon] = useState('🙏');
  const [customs, setCustoms] = useState<Deity[]>([]);

  const togglePick = (id: string) =>
    setPickedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const addCustom = () => {
    if (!customName.trim()) {
      showToast('Enter the deity name first');
      return;
    }
    const d: Deity = {
      id: `c-${Date.now()}`,
      name: customName.trim(),
      icon: customIcon,
      mantra: customMantra.trim() || 'Om Namah',
      prayerAlarm: '06:00',
      alarmOn: false,
      totalMalas: 0,
    };
    setCustoms(prev => [...prev, d]);
    setPickedIds(prev => new Set(prev).add(d.id));
    setCustomName('');
    setCustomMantra('');
    setCustomIcon('🙏');
  };

  const submitIdentity = () => {
    if (!name.trim()) {
      showToast('Please enter your name');
      return;
    }
    if (!contact.trim()) {
      showToast('Email or phone is required');
      return;
    }
    if (contactType === 'email' && !validEmail(contact)) {
      showToast('Please enter a valid email');
      return;
    }
    if (contactType === 'phone' && !validPhone(contact)) {
      showToast('Please enter a valid phone number');
      return;
    }
    setStep('deities');
  };

  const finish = () => {
    const allCandidates = [...DEFAULT_DEITIES, ...customs];
    const finalDeities = allCandidates.filter(d => pickedIds.has(d.id));
    setDeities(finalDeities);

    const profile: UserProfile = {
      name: name.trim(),
      createdAt: new Date().toISOString(),
      onboarded: true,
      ...(contactType === 'email'
        ? { email: contact.trim() }
        : { phone: contact.trim() }),
    };
    setUserProfile(profile);
    showToast(`Welcome, ${profile.name}! 🙏`);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {step === 'welcome' && <Welcome onNext={() => setStep('identity')} />}

        {step === 'identity' && (
          <Identity
            name={name}
            contact={contact}
            contactType={contactType}
            onName={setName}
            onContact={setContact}
            onTypeChange={setContactType}
            onBack={() => setStep('welcome')}
            onNext={submitIdentity}
          />
        )}

        {step === 'deities' && (
          <DeityPicker
            customs={customs}
            picked={pickedIds}
            onToggle={togglePick}
            customName={customName}
            customMantra={customMantra}
            customIcon={customIcon}
            onCustomName={setCustomName}
            onCustomMantra={setCustomMantra}
            onCustomIcon={setCustomIcon}
            onAddCustom={addCustom}
            onBack={() => setStep('identity')}
            onFinish={finish}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const Welcome = ({ onNext }: { onNext: () => void }) => (
  <View style={styles.center}>
    <Text style={styles.bigEmoji}>🪷</Text>
    <Text style={styles.title}>Sadhana</Text>
    <Text style={styles.tagline}>Your daily spiritual companion</Text>

    <View style={styles.featureList}>
      <Feature icon="📿" text="Japa counter with sacred mala" />
      <Feature icon="🌅" text="Sandhya Vandanam — three daily junctures" />
      <Feature icon="🪔" text="Festival calendar with Panchang" />
      <Feature icon="🌸" text="Personal deity worship & reminders" />
      <Feature icon="📊" text="Track your progress over time" />
    </View>

    <TouchableOpacity style={styles.primaryBtn} onPress={onNext}>
      <Text style={styles.primaryBtnText}>Begin →</Text>
    </TouchableOpacity>
  </View>
);

const Feature = ({ icon, text }: { icon: string; text: string }) => (
  <View style={styles.featureRow}>
    <Text style={styles.featureIcon}>{icon}</Text>
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const Identity = ({
  name,
  contact,
  contactType,
  onName,
  onContact,
  onTypeChange,
  onBack,
  onNext,
}: {
  name: string;
  contact: string;
  contactType: 'email' | 'phone';
  onName: (s: string) => void;
  onContact: (s: string) => void;
  onTypeChange: (t: 'email' | 'phone') => void;
  onBack: () => void;
  onNext: () => void;
}) => (
  <View style={styles.stepContent}>
    <Text style={styles.stepLabel}>Step 1 of 2</Text>
    <Text style={styles.title}>Tell us about you</Text>
    <Text style={styles.subtitle}>So we can personalize your sadhana</Text>

    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Your name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={onName}
        placeholder="e.g. Lakshmi Pavani"
        placeholderTextColor={COLORS.muted}
        autoFocus
      />
    </View>

    <View style={styles.toggleRow}>
      <TouchableOpacity
        style={[styles.toggleBtn, contactType === 'email' && styles.toggleBtnActive]}
        onPress={() => onTypeChange('email')}
      >
        <Text
          style={[
            styles.toggleText,
            contactType === 'email' && styles.toggleTextActive,
          ]}
        >
          Email
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.toggleBtn, contactType === 'phone' && styles.toggleBtnActive]}
        onPress={() => onTypeChange('phone')}
      >
        <Text
          style={[
            styles.toggleText,
            contactType === 'phone' && styles.toggleTextActive,
          ]}
        >
          Phone
        </Text>
      </TouchableOpacity>
    </View>

    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {contactType === 'email' ? 'Email address' : 'Phone number'}
      </Text>
      <TextInput
        style={styles.input}
        value={contact}
        onChangeText={onContact}
        placeholder={contactType === 'email' ? 'you@example.com' : '+91 98765 43210'}
        placeholderTextColor={COLORS.muted}
        keyboardType={contactType === 'email' ? 'email-address' : 'phone-pad'}
        autoCapitalize="none"
      />
      <Text style={styles.hint}>
        Stored only on this device. Used for backup & profile.
      </Text>
    </View>

    <View style={styles.btnRow}>
      <TouchableOpacity style={styles.secondaryBtn} onPress={onBack}>
        <Text style={styles.secondaryBtnText}>← Back</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={onNext}>
        <Text style={styles.primaryBtnText}>Continue →</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const DeityPicker = ({
  customs,
  picked,
  onToggle,
  customName,
  customMantra,
  customIcon,
  onCustomName,
  onCustomMantra,
  onCustomIcon,
  onAddCustom,
  onBack,
  onFinish,
}: {
  customs: Deity[];
  picked: Set<string>;
  onToggle: (id: string) => void;
  customName: string;
  customMantra: string;
  customIcon: string;
  onCustomName: (s: string) => void;
  onCustomMantra: (s: string) => void;
  onCustomIcon: (s: string) => void;
  onAddCustom: () => void;
  onBack: () => void;
  onFinish: () => void;
}) => {
  const all = [...DEFAULT_DEITIES, ...customs];
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepLabel}>Step 2 of 2</Text>
      <Text style={styles.title}>Pick your deities</Text>
      <Text style={styles.subtitle}>
        These appear in your Japa, Dashboard and reminders. You can change anytime.
      </Text>

      <View style={styles.deityGrid}>
        {all.map(d => {
          const isPicked = picked.has(d.id);
          return (
            <TouchableOpacity
              key={d.id}
              style={[styles.deityChip, isPicked && styles.deityChipActive]}
              onPress={() => onToggle(d.id)}
            >
              <Text style={styles.deityChipIcon}>{d.icon}</Text>
              <Text style={[styles.deityChipName, isPicked && styles.deityChipNameActive]}>
                {d.name}
              </Text>
              <Text style={styles.deityChipMantra}>{d.mantra}</Text>
              {isPicked && <View style={styles.deityChipCheck}><Text style={{color: COLORS.deep, fontSize: 11, fontWeight: '700'}}>✓</Text></View>}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.divider} />

      <Text style={styles.subSection}>Add your own deity</Text>

      <View style={styles.field}>
        <TextInput
          style={styles.input}
          value={customName}
          onChangeText={onCustomName}
          placeholder="Deity name (e.g. Lord Hanuman)"
          placeholderTextColor={COLORS.muted}
        />
      </View>
      <View style={styles.field}>
        <TextInput
          style={styles.input}
          value={customMantra}
          onChangeText={onCustomMantra}
          placeholder="Mantra (e.g. Om Hanumate Namah)"
          placeholderTextColor={COLORS.muted}
        />
      </View>
      <View style={styles.iconGrid}>
        {ICONS.slice(0, 12).map(ic => (
          <TouchableOpacity
            key={ic}
            style={[styles.iconBtn, customIcon === ic && styles.iconBtnActive]}
            onPress={() => onCustomIcon(ic)}
          >
            <Text style={{ fontSize: 22 }}>{ic}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.addCustomBtn} onPress={onAddCustom}>
        <Text style={styles.addCustomBtnText}>+ Add this deity</Text>
      </TouchableOpacity>

      <View style={[styles.btnRow, { marginTop: SPACING.lg }]}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onBack}>
          <Text style={styles.secondaryBtnText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, { flex: 1 }, picked.size === 0 && styles.primaryBtnDisabled]}
          onPress={onFinish}
          disabled={picked.size === 0}
        >
          <Text style={styles.primaryBtnText}>
            Finish ({picked.size} picked)
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  scroll: {
    paddingTop: 50,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  center: { alignItems: 'center', paddingTop: 30 },
  bigEmoji: { fontSize: 80, marginBottom: SPACING.md },
  title: {
    fontSize: 32,
    color: COLORS.cream,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  stepLabel: {
    fontSize: 11,
    color: COLORS.gold,
    letterSpacing: 2,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  stepContent: { paddingTop: SPACING.lg },
  featureList: { marginVertical: SPACING.lg, alignSelf: 'stretch' },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  featureIcon: { fontSize: 22, marginRight: SPACING.md, width: 30 },
  featureText: { flex: 1, fontSize: 14, color: COLORS.cream },
  field: { marginBottom: SPACING.md },
  fieldLabel: {
    fontSize: 11,
    color: COLORS.muted,
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: COLORS.cream,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  hint: { fontSize: 11, color: COLORS.muted, marginTop: 6, fontStyle: 'italic' },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    padding: 4,
    marginBottom: SPACING.md,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: COLORS.gold },
  toggleText: { fontSize: 13, color: COLORS.muted, fontWeight: '500' },
  toggleTextActive: { color: COLORS.deep, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: COLORS.deep, fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: 10,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  secondaryBtnText: { color: COLORS.cream, fontSize: 14, fontWeight: '500' },
  btnRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', marginTop: SPACING.md },
  deityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginVertical: SPACING.md,
  },
  deityChip: {
    width: '48%',
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    position: 'relative',
  },
  deityChipActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(212, 160, 23, 0.1)',
  },
  deityChipIcon: { fontSize: 28, marginBottom: 6 },
  deityChipName: { fontSize: 13, color: COLORS.cream, fontWeight: '600' },
  deityChipNameActive: { color: COLORS.gold },
  deityChipMantra: { fontSize: 10, color: COLORS.muted, marginTop: 2, fontStyle: 'italic' },
  deityChipCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.lg,
  },
  subSection: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(212, 160, 23, 0.2)',
  },
  iconBtnActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
  },
  addCustomBtn: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold,
    marginTop: 4,
  },
  addCustomBtnText: { color: COLORS.gold, fontSize: 13, fontWeight: '600' },
});
