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
import { Deity, UserProfile } from '../types';
import { COLORS, SPACING } from '../theme';
import { DeityCatalogPicker } from '../components/DeityCatalogPicker';
import { CatalogDeity, ALL_CATALOG_DEITIES } from '../deityCatalog';
import { otpClient } from '../soulsync/auth/otpClient';

type Step = 'welcome' | 'identity' | 'otp' | 'deities' | 'done';

const generateOTP = (): string =>
  String(Math.floor(100000 + Math.random() * 900000));

const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const validPhone = (s: string) => /^\+?\d[\d\s-]{6,}$/.test(s.trim());

export const OnboardingScreen = () => {
  const { setUserProfile, setDeities, showToast } = useSadhana();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [contactType, setContactType] = useState<'email' | 'phone'>('email');
  const [otp, setOtp] = useState('');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpSentAt, setOtpSentAt] = useState<number>(0);

  // Pre-selected: Ganesha + Krishna + Lakshmi from catalog
  const [pickedIds, setPickedIds] = useState<Set<string>>(
    new Set(['ganesha', 'krishna', 'lakshmi'])
  );
  const [customs, setCustoms] = useState<Deity[]>([]);

  const togglePick = (d: CatalogDeity) =>
    setPickedIds(prev => {
      const next = new Set(prev);
      next.has(d.id) ? next.delete(d.id) : next.add(d.id);
      return next;
    });

  const addCustom = (name: string, icon: string, mantra: string) => {
    const id = `custom-${Date.now()}`;
    const d: Deity = {
      id,
      name,
      icon,
      mantra,
      prayerAlarm: '06:00',
      alarmOn: false,
      totalMalas: 0,
    };
    setCustoms(prev => [...prev, d]);
    setPickedIds(prev => new Set(prev).add(id));
    showToast(`${icon} ${name} added`);
  };

  const submitIdentity = async () => {
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
    // Try backend send; falls back to demo mode if no backend is configured
    const res = await otpClient.send(contact, contactType);
    if (!res.sent) {
      showToast(`Could not send OTP: ${res.error}`);
      return;
    }
    // In mock/demo mode the backend (and thus otpClient) returns the OTP so we
    // can show it on-screen for development. In production it's sent only via
    // email/SMS and demoOtp is undefined.
    setOtp(res.demoOtp ?? '');     // empty when real backend is in use
    setEnteredOtp('');
    setOtpSentAt(Date.now());
    setStep('otp');
    showToast(res.demoOtp ? `Demo OTP: ${res.demoOtp}` : 'OTP sent — check your email/phone');
  };

  const resendOtp = async () => {
    const res = await otpClient.send(contact, contactType);
    if (!res.sent) {
      showToast(`Resend failed: ${res.error}`);
      return;
    }
    setOtp(res.demoOtp ?? '');
    setEnteredOtp('');
    setOtpSentAt(Date.now());
    showToast(res.demoOtp ? `New OTP: ${res.demoOtp}` : 'New OTP sent');
  };

  const verifyOtp = async () => {
    if (Date.now() - otpSentAt > 10 * 60 * 1000) {
      showToast('OTP expired — please resend');
      return;
    }
    const res = await otpClient.verify(contact, enteredOtp, otp || undefined);
    if (!res.verified) {
      showToast(res.reason === 'mismatch' ? 'Wrong OTP — try again' : `Verify failed: ${res.reason}`);
      return;
    }
    showToast('Verified ✓');
    setStep('deities');
  };

  const finish = () => {
    // Map catalog deities (no totalMalas / alarms yet) into real Deity records
    const fromCatalog: Deity[] = ALL_CATALOG_DEITIES
      .filter(c => pickedIds.has(c.id))
      .map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        mantra: c.mantra,
        prayerAlarm: '06:00',
        alarmOn: false,
        totalMalas: 0,
        malaMaterial: c.malaMaterial,
        malaColor: c.malaColor,
        malaHighlight: c.malaHighlight,
      }));
    const fromCustom = customs.filter(c => pickedIds.has(c.id));
    const finalDeities = [...fromCatalog, ...fromCustom];
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
            onTypeChange={t => {
              // T2: reset input on toggle to avoid stale data (e.g. email
              // text left when switching to Phone)
              setContactType(t);
              setContact('');
            }}
            onBack={() => setStep('welcome')}
            onNext={submitIdentity}
          />
        )}

        {step === 'otp' && (
          <OtpVerify
            contact={contact}
            contactType={contactType}
            otp={otp}
            enteredOtp={enteredOtp}
            onChange={setEnteredOtp}
            onResend={resendOtp}
            onVerify={verifyOtp}
            onBack={() => setStep('identity')}
          />
        )}

        {step === 'deities' && (
          <View style={styles.stepContent}>
            <Text style={styles.stepLabel}>Step 2 of 2</Text>
            <Text style={styles.title}>Choose your deities</Text>
            <Text style={styles.subtitle}>
              Tap deities to add to your sadhana. Includes the Trinity, Dashavatara,
              Devi, Dasha Mahavidya, Ashta Bhairava and more.
            </Text>

            <DeityCatalogPicker
              pickedIds={pickedIds}
              onTogglePick={togglePick}
              showCustom={false}
            />
            <Text style={styles.customHint}>
              Want a custom deity? You can add one later from the Deities tab.
            </Text>

            <View style={[styles.btnRow, { marginTop: SPACING.lg }]}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('otp')}>
                <Text style={styles.secondaryBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }, pickedIds.size === 0 && styles.primaryBtnDisabled]}
                onPress={finish}
                disabled={pickedIds.size === 0}
              >
                <Text style={styles.primaryBtnText}>
                  Finish ({pickedIds.size})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
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

    <TouchableOpacity style={[styles.primaryBtn, { marginTop: SPACING.lg }]} onPress={onNext}>
      <Text style={styles.primaryBtnText}>Begin →</Text>
    </TouchableOpacity>
  </View>
);

const OtpVerify = ({
  contact,
  contactType,
  otp,
  enteredOtp,
  onChange,
  onResend,
  onVerify,
  onBack,
}: {
  contact: string;
  contactType: 'email' | 'phone';
  otp: string;
  enteredOtp: string;
  onChange: (v: string) => void;
  onResend: () => void;
  onVerify: () => void;
  onBack: () => void;
}) => (
  <View style={styles.stepContent}>
    <Text style={styles.stepLabel}>Verify your {contactType}</Text>
    <Text style={styles.title}>Enter the OTP</Text>
    <Text style={styles.subtitle}>
      We sent a 6-digit code to {'\n'}
      <Text style={{ color: COLORS.gold, fontWeight: '700' }}>{contact}</Text>
    </Text>

    {/* Shown only when no OTP backend is configured (mock/demo mode). When the
        Cloudflare Worker is wired up, `otp` is empty and this banner hides. */}
    {otp ? (
      <View style={styles.demoBanner}>
        <Text style={styles.demoBannerTitle}>🔓 Demo build</Text>
        <Text style={styles.demoBannerText}>
          No OTP backend configured. Configure one in Settings to send via email/SMS.
          For now, your OTP is:
        </Text>
        <Text style={styles.demoOtp}>{otp}</Text>
      </View>
    ) : null}

    <View style={styles.field}>
      <Text style={styles.fieldLabel}>6-digit OTP</Text>
      <TextInput
        style={[styles.input, styles.otpInput]}
        value={enteredOtp}
        onChangeText={t => onChange(t.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        placeholderTextColor={COLORS.muted}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
      />
    </View>

    <TouchableOpacity onPress={onResend} style={{ alignSelf: 'center', padding: SPACING.sm }}>
      <Text style={{ color: COLORS.gold, fontSize: 13 }}>Didn't receive? Resend</Text>
    </TouchableOpacity>

    <View style={styles.btnRow}>
      <TouchableOpacity style={styles.secondaryBtn} onPress={onBack}>
        <Text style={styles.secondaryBtnText}>← Back</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.primaryBtn, { flex: 1 }, enteredOtp.length !== 6 && styles.primaryBtnDisabled]}
        onPress={onVerify}
        disabled={enteredOtp.length !== 6}
      >
        <Text style={styles.primaryBtnText}>Verify →</Text>
      </TouchableOpacity>
    </View>
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


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  scroll: {
    paddingTop: 50,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  center: { alignItems: 'stretch', paddingTop: 30, paddingHorizontal: SPACING.md },
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
  customHint: {
    fontSize: 11,
    color: COLORS.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
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
  demoBanner: {
    backgroundColor: 'rgba(255, 140, 66, 0.12)',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.saffron,
    padding: SPACING.md,
    borderRadius: 8,
    marginVertical: SPACING.md,
  },
  demoBannerTitle: { fontSize: 12, color: COLORS.saffron, fontWeight: '700', marginBottom: 4 },
  demoBannerText: { fontSize: 11, color: COLORS.muted, marginBottom: 8, lineHeight: 16 },
  demoOtp: {
    fontSize: 28,
    color: COLORS.gold,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
    backgroundColor: 'rgba(212, 160, 23, 0.1)',
    paddingVertical: 8,
    borderRadius: 6,
  },
  otpInput: {
    fontSize: 26,
    letterSpacing: 10,
    textAlign: 'center',
    fontWeight: '700',
  },
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
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',          // T1: full-width via stretch instead of fixed positioning
    minHeight: 52,
    // NOTE: marginTop is applied per-site (standalone Begin button uses
    // marginTop; inside btnRow we rely on the row's own marginTop instead so
    // primary + secondary buttons share a baseline)
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
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 90,
  },
  secondaryBtnText: { color: COLORS.cream, fontSize: 14, fontWeight: '500' },
  btnRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'stretch',
    marginTop: SPACING.md,
  },
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
