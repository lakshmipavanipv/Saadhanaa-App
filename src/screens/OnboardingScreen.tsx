/**
 * OnboardingScreen — first-launch flow for the Body & Soul Ring app.
 *
 * New flow (v40):
 *   1. Welcome     — animated lotus + "BODY & SOUL" wordmark · auto-advances in ~2.5s
 *   2. Identity    — Google Sign-In (or manual name+email/phone fallback)
 *   3. Ring        — Bluetooth pair the Body & Soul Ring (or Skip)
 *   4. About you   — Name (if not from Google) · DOB · Gender · Religion · all in one screen
 *   5. Plan?       — Big choice: "Plan your routine now" → opens Plan tab · "Skip for now" → Home tab
 *
 * Deity selection was removed from onboarding (was a forced step that
 * blocked first-time users from finishing). Users add deities later from
 * the Japa tab or Plan tab whenever they want.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { useSadhana } from '../context';
import { UserProfile , BodyActivity, SoulActivity, UserGoals } from '../types';
import { COLORS, SPACING } from '../theme';
import { WellBeingHero } from '../components/WellBeingHero';
import { BodySoulLogo } from '../soulsync/components/BodySoulLogo';
import { otpClient } from '../soulsync/auth/otpClient';
import {
  isFirebaseAvailable,
  signInWithGoogle,
  signInAnonymously,
} from '../services/firebaseAuth';
import {
  requestBlePermissions,
  scanForDevices,
  connectAndListen,
  ScannedDevice,
} from '../services/ble';
import { RingSpinner } from '../components/RingSpinner';

type Step = 'welcome' | 'identity' | 'otp' | 'ring' | 'about' | 'plan-prompt';

type Gender = NonNullable<UserProfile['gender']>;
type Religion = NonNullable<UserProfile['religion']>;

const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const validPhone = (s: string) => /^\+?\d[\d\s-]{6,}$/.test(s.trim());

const GENDERS: { id: Gender; label: string; icon: string }[] = [
  { id: 'male',                label: 'Male',     icon: '👨' },
  { id: 'female',              label: 'Female',   icon: '👩' },
  { id: 'other',               label: 'Other',    icon: '🌈' },
  { id: 'prefer-not-to-say',   label: 'Skip',     icon: '🙏' },
];

const RELIGIONS: { id: Religion; label: string; icon: string }[] = [
  { id: 'hindu',     label: 'Hindu',     icon: '🕉' },
  { id: 'buddhist',  label: 'Buddhist',  icon: '☸' },
  { id: 'jain',      label: 'Jain',      icon: '🪷' },
  { id: 'sikh',      label: 'Sikh',      icon: '🪯' },
  { id: 'spiritual', label: 'Spiritual', icon: '✨' },
  { id: 'other',     label: 'Other',     icon: '🌿' },
];

export const OnboardingScreen = () => {
  const { setUserProfile, setPendingRoute, showToast } = useSadhana();
  const [step, setStep] = useState<Step>('welcome');

  // Identity
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [contactType, setContactType] = useState<'email' | 'phone'>('email');
  // v71: OTP verification for the manual email/phone path.
  const [otpDemo, setOtpDemo] = useState<string | null>(null);
  const [otpSending, setOtpSending] = useState(false);

  // About you
  const [dob, setDob] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [religion, setReligion] = useState<Religion | null>(null);

  // Body / soul goals — sensible defaults the user never sees during onboarding,
  // but persisted so the AI plan engine has something to start with.
  const bodyActivities: BodyActivity[] = ['walk', 'gym'];
  const soulActivities: SoulActivity[] = ['japa', 'meditation'];

  // v68: accepts optional direct values so Google / anonymous sign-in can
  // pass the freshly-returned name+email WITHOUT relying on React state that
  // hasn't flushed yet. Previously the Google handler set state then called
  // this via setTimeout — but the captured closure still read the OLD empty
  // contact (and onTypeChange had just cleared it), so it always failed with
  // "Email or phone is required". Passing values directly removes both races.
  const submitIdentity = async (override?: {
    name?: string; contact?: string; type?: 'email' | 'phone'; skipOtp?: boolean;
  }) => {
    const n = (override?.name ?? name).trim();
    const c = (override?.contact ?? contact).trim();
    const t = override?.type ?? contactType;
    if (!n) { showToast('Please enter your name'); return; }
    if (!c) { showToast('Email or phone is required'); return; }
    if (t === 'email' && !validEmail(c)) { showToast('Please enter a valid email'); return; }
    if (t === 'phone' && !validPhone(c)) { showToast('Please enter a valid phone number'); return; }
    // Persist the resolved identity so later steps + the final save have it.
    if (override) { setName(n); setContact(c); setContactType(t); }
    // v74: anonymous skip is the ONLY path that bypasses OTP. BOTH manual
    // entry AND Google sign-in now go through the OTP screen (the user wants
    // to verify the code after signing in). In demo mode the code shows
    // on-screen; with the backend deployed it's a real emailed code.
    if (override?.skipOtp) {
      showToast('Welcome 🙏');
      setStep('ring');
      return;
    }
    setOtpSending(true);
    const res = await otpClient.send(c, t);
    setOtpSending(false);
    if (!res.sent) {
      showToast(`Could not send code: ${res.error}`);
      return;
    }
    setOtpDemo(res.demoOtp ?? null);
    showToast(`Code sent to ${c}`);
    setStep('otp');
  };

  const resendOtp = async () => {
    setOtpSending(true);
    const res = await otpClient.send(contact, contactType);
    setOtpSending(false);
    if (res.sent) { setOtpDemo(res.demoOtp ?? null); showToast('New code sent'); }
    else showToast(`Could not resend: ${res.error}`);
  };

  const verifyOtp = async (code: string) => {
    const res = await otpClient.verify(contact, code, otpDemo ?? undefined);
    if (res.verified) { showToast('✓ Verified 🙏'); setStep('ring'); }
    else showToast('Incorrect code — please try again');
  };

  // ── Bluetooth pairing ───────────────────────────────────────────
  const [scanning, setScanning] = useState(false);
  const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [pairedDevice, setPairedDevice] = useState<string | null>(null);
  const stopScanRef = useRef<(() => void) | null>(null);

  const startScan = async () => {
    if (Platform.OS === 'web') {
      showToast('Bluetooth pairing is available in the Android build');
      return;
    }
    const granted = await requestBlePermissions();
    if (!granted) {
      showToast('Bluetooth permission denied');
      return;
    }
    setScannedDevices([]);
    setScanning(true);
    stopScanRef.current = scanForDevices(
      d => setScannedDevices(p => {
        if (p.some(x => x.id === d.id)) return p;
        return [...p, d];
      }),
      err => {
        showToast(err);
        setScanning(false);
      },
      15000
    );
    setTimeout(() => setScanning(false), 15000);
  };

  const pairDevice = async (id: string, name: string) => {
    stopScanRef.current?.();
    setScanning(false);
    setConnectingId(id);
    try {
      await connectAndListen(id, () => {}, () => setPairedDevice(null));
      setPairedDevice(name);
      showToast(`✓ Paired with ${name}`);
    } catch (e: any) {
      showToast(`Pairing failed: ${e?.message || 'unknown'}`);
    } finally {
      setConnectingId(null);
    }
  };

  // ── Persist the profile and finish onboarding ──
  const finish = (goToPlan: boolean) => {
    const goals: UserGoals = {
      bodyMinutesPerDay: 30,
      bodyActivities,
      soulMinutesPerDay: 20,
      soulActivities,
    };

    const hParsed = parseInt(heightCm, 10);
    const wParsed = parseInt(weightKg, 10);
    const profile: UserProfile = {
      name: name.trim() || 'Friend',
      createdAt: new Date().toISOString(),
      onboarded: true,
      ...(contactType === 'email'
        ? { email: contact.trim() }
        : { phone: contact.trim() }),
      ...(dob && { dob }),
      ...(Number.isFinite(hParsed) && hParsed > 0 && { heightCm: hParsed }),
      ...(Number.isFinite(wParsed) && wParsed > 0 && { weightKg: wParsed }),
      ...(gender && { gender }),
      ...(religion && { religion }),
      goals,
    };
    // Stash the navigation intent BEFORE flipping `onboarded` so App.tsx
    // sees it the moment the TabNavigator mounts.  App.tsx watches
    // `pendingRoute` + the navRef and calls navigate() on first tick.
    if (goToPlan) setPendingRoute('Plan');
    setUserProfile(profile);
    showToast(
      goToPlan
        ? `Welcome, ${profile.name}! Let's plan your well-being 🌿`
        : `Welcome, ${profile.name}! 🙏`
    );
    // After this, the App container re-renders to TabNavigator because
    // userProfile.onboarded flipped to true. The `goToPlan` flag is
    // stashed for the parent navigator to honour via DashboardScreen's
    // default initial-route logic (handled in DashboardScreen / context).
    // For now we just rely on the user tapping "Plan your routine" CTA.
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {step === 'welcome' && <Welcome onDone={() => setStep('identity')} />}

        {step === 'identity' && (
          <Identity
            name={name}
            contact={contact}
            contactType={contactType}
            onName={setName}
            onContact={setContact}
            onTypeChange={t => {
              setContactType(t);
              setContact('');
            }}
            onNext={submitIdentity}
          />
        )}

        {step === 'otp' && (
          <OtpStep
            contact={contact}
            demoOtp={otpDemo}
            sending={otpSending}
            onVerify={verifyOtp}
            onResend={resendOtp}
            onBack={() => setStep('identity')}
          />
        )}

        {step === 'ring' && (
          <RingStep
            scanning={scanning}
            scannedDevices={scannedDevices}
            connectingId={connectingId}
            pairedDevice={pairedDevice}
            onScan={startScan}
            onPair={pairDevice}
            onBack={() => setStep('identity')}
            onNext={() => setStep('about')}
          />
        )}

        {step === 'about' && (
          <About
            name={name}
            dob={dob}
            heightCm={heightCm}
            weightKg={weightKg}
            gender={gender}
            religion={religion}
            onName={setName}
            onDob={setDob}
            onHeight={setHeightCm}
            onWeight={setWeightKg}
            onGender={setGender}
            onReligion={setReligion}
            onBack={() => setStep('ring')}
            onNext={() => setStep('plan-prompt')}
          />
        )}

        {step === 'plan-prompt' && (
          <PlanPrompt
            onPlanNow={() => finish(true)}
            onSkip={() => finish(false)}
            onBack={() => setStep('about')}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ─── Welcome — animated BodySoulLogo (no lotus/yantra) ──
// v74: previously showed WellBeingHero (a lotus + dashed-mandala "yantra"),
// which the user flagged as an unwanted extra window. Replaced with the same
// animated infinity-ribbon logo as the boot splash for one consistent brand.

const Welcome = ({ onDone }: { onDone: () => void }) => {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
      <BodySoulLogo width={280} />
    </View>
  );
};

// ─── OTP verification step (manual email/phone path) ─────────────

const OtpStep = ({
  contact, demoOtp, sending, onVerify, onResend, onBack,
}: {
  contact: string;
  demoOtp: string | null;
  sending: boolean;
  onVerify: (code: string) => void;
  onResend: () => void;
  onBack: () => void;
}) => {
  // v71: in demo mode the code is generated on-device — auto-fill it so the
  // user can SEE it and just tap Verify (matches the requested UX). With a
  // real backend, demoOtp is null and the box starts empty.
  const [code, setCode] = useState(demoOtp ?? '');
  useEffect(() => { if (demoOtp) setCode(demoOtp); }, [demoOtp]);

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepLabel}>VERIFY</Text>
      <Text style={styles.title}>Enter your code</Text>
      <Text style={styles.subtitle}>
        We sent a 6-digit verification code to{'\n'}
        <Text style={{ color: COLORS.gold, fontWeight: '700' }}>{contact}</Text>
      </Text>

      {demoOtp ? (
        <View style={styles.otpDemoBanner}>
          <Text style={styles.otpDemoText}>
            Demo mode — no email server is set up yet, so your code is shown here:
          </Text>
          <Text style={styles.otpDemoCode}>{demoOtp}</Text>
        </View>
      ) : null}

      <TextInput
        style={styles.otpInput}
        value={code}
        onChangeText={t => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="••••••"
        placeholderTextColor={COLORS.muted}
        textAlign="center"
      />

      <TouchableOpacity
        style={[styles.primaryBtn, { marginTop: SPACING.md }, code.trim().length < 4 && { opacity: 0.5 }]}
        onPress={() => onVerify(code)}
        disabled={code.trim().length < 4}
      >
        <Text style={styles.primaryBtnText}>Verify &amp; continue →</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onResend} disabled={sending} style={{ alignSelf: 'center', marginTop: SPACING.md, padding: SPACING.sm }}>
        <Text style={{ color: COLORS.gold, fontSize: 13, fontWeight: '600' }}>
          {sending ? 'Sending…' : 'Resend code'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onBack} style={{ alignSelf: 'center', padding: SPACING.sm }}>
        <Text style={{ color: COLORS.muted, fontSize: 12, textDecorationLine: 'underline' }}>
          ‹ Change email / phone
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Identity — Google Sign-In primary, manual fallback ──────────

const Identity = ({
  name, contact, contactType,
  onName, onContact, onTypeChange,
  onNext,
}: {
  name: string;
  contact: string;
  contactType: 'email' | 'phone';
  onName: (s: string) => void;
  onContact: (s: string) => void;
  onTypeChange: (t: 'email' | 'phone') => void;
  onNext: (override?: { name?: string; contact?: string; type?: 'email' | 'phone'; skipOtp?: boolean }) => void;
}) => {
  const { showToast } = useSadhana();
  const [signingIn, setSigningIn] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [firebaseAvailable, setFirebaseAvailable] = useState(false);

  useEffect(() => {
    isFirebaseAvailable().then(setFirebaseAvailable);
  }, []);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      const u = await signInWithGoogle();
      if (u && u.email) {
        // Pass the values straight through — don't route via state setters,
        // which raced and got cleared by onTypeChange before validation.
        const resolvedName = u.name || u.email.split('@')[0];
        onName(resolvedName);
        onContact(u.email);
        onNext({ name: resolvedName, contact: u.email, type: 'email' });
      } else {
        // v67: null now means ONLY user-cancelled (real failures throw and
        // are caught below with their actual error code). Calm message.
        showToast('Sign-in cancelled. Pick your account, or use manual entry below.');
      }
    } catch (e: any) {
      console.warn('[Onboarding] Google sign-in failed:', e?.message);
      showToast(`Google sign-in error: ${e?.message || 'unknown'}. Use manual entry instead.`);
    } finally {
      setSigningIn(false);
    }
  };

  const handleSkipWithAnonymous = async () => {
    setSkipping(true);
    try {
      await signInAnonymously();
      const resolvedName = name.trim() || 'Friend';
      const resolvedContact = contact.trim() || 'friend@bodyandsoul.app';
      onName(resolvedName);
      onContact(resolvedContact);
      // Anonymous skip — no OTP (placeholder contact, nothing to verify).
      onNext({ name: resolvedName, contact: resolvedContact, type: 'email', skipOtp: true });
    } finally {
      setSkipping(false);
    }
  };

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepLabel}>STEP 1 OF 4</Text>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.subtitle}>
        Use your Google account already on this phone{'\n'}
        <Text style={{ color: '#3ddc84' }}>✓ One tap · No password · No OTP</Text>
      </Text>

      <TouchableOpacity
        style={[styles.googleBtn, signingIn && { opacity: 0.6 }]}
        onPress={handleGoogleSignIn}
        disabled={signingIn || skipping || !firebaseAvailable}
      >
        {signingIn ? (
          <RingSpinner size={22} color={COLORS.deep} />
        ) : (
          <>
            <Text style={styles.googleG}>G</Text>
            <Text style={styles.googleBtnText}>
              {firebaseAvailable ? 'Continue with Google' : 'Google sign-in unavailable on web'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.googleHint}>
        Tap above → pick your Google account → app auto-fills your name and email.
      </Text>

      {firebaseAvailable && (
        <TouchableOpacity
          style={[styles.skipBtn, skipping && { opacity: 0.6 }]}
          onPress={handleSkipWithAnonymous}
          disabled={signingIn || skipping}
        >
          {skipping
            ? <RingSpinner size={18} color={COLORS.cream} />
            : <Text style={styles.skipBtnText}>Skip for now · continue without sign-in</Text>}
        </TouchableOpacity>
      )}

      {!showManual ? (
        <TouchableOpacity
          onPress={() => setShowManual(true)}
          style={{ alignSelf: 'center', marginTop: SPACING.md, padding: SPACING.sm }}
        >
          <Text style={{ color: COLORS.muted, fontSize: 12, textDecorationLine: 'underline' }}>
            Or enter details manually
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={{ marginTop: SPACING.lg }}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Your name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={onName}
              placeholder="e.g. Lakshmi Pavani"
              placeholderTextColor={COLORS.muted}
            />
          </View>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, contactType === 'email' && styles.toggleBtnActive]}
              onPress={() => onTypeChange('email')}
            >
              <Text style={[styles.toggleText, contactType === 'email' && styles.toggleTextActive]}>Email</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, contactType === 'phone' && styles.toggleBtnActive]}
              onPress={() => onTypeChange('phone')}
            >
              <Text style={[styles.toggleText, contactType === 'phone' && styles.toggleTextActive]}>Phone</Text>
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
            <Text style={styles.hint}>Stored only on this device.</Text>
          </View>
          <TouchableOpacity style={[styles.primaryBtn, { marginTop: SPACING.sm }]} onPress={() => onNext()}>
            <Text style={styles.primaryBtnText}>Continue →</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ─── Ring — Bluetooth pairing ────────────────────────────────────

const RingStep = ({
  scanning, scannedDevices, connectingId, pairedDevice,
  onScan, onPair, onBack, onNext,
}: {
  scanning: boolean;
  scannedDevices: ScannedDevice[];
  connectingId: string | null;
  pairedDevice: string | null;
  onScan: () => void;
  onPair: (id: string, name: string) => void;
  onBack: () => void;
  onNext: () => void;
}) => (
  <View style={styles.stepContent}>
    <Text style={styles.stepLabel}>STEP 2 OF 4</Text>
    <Text style={styles.title}>Pair your Body &amp; Soul Ring</Text>
    <Text style={styles.subtitle}>
      The ring tracks your heart rate, HRV and movement so the app can
      sense how your sadhana is impacting your vitals. Pair now or skip.
    </Text>

    {Platform.OS === 'web' ? (
      <View style={styles.demoBanner}>
        <Text style={styles.demoBannerTitle}>ℹ️ Bluetooth on Android only</Text>
        <Text style={styles.demoBannerText}>
          Bluetooth pairing works in the installed Android APK. On the web
          preview you can skip this step and pair later from the Japa tab.
        </Text>
      </View>
    ) : (
      <>
        {pairedDevice ? (
          <View style={styles.demoBanner}>
            <Text style={styles.demoBannerTitle}>✓ Paired</Text>
            <Text style={styles.demoBannerText}>
              Connected to <Text style={{ color: COLORS.gold, fontWeight: '700' }}>{pairedDevice}</Text>
            </Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.primaryBtn, { marginVertical: SPACING.md }]}
              onPress={onScan}
              disabled={scanning}
            >
              {scanning
                ? <RingSpinner size={22} color={COLORS.deep} />
                : <Text style={styles.primaryBtnText}>🔍 Scan for devices</Text>}
            </TouchableOpacity>

            {scannedDevices.length > 0 && (
              <View style={{ marginBottom: SPACING.md }}>
                <Text style={styles.fieldLabel}>Available devices</Text>
                {scannedDevices.map(d => (
                  <TouchableOpacity
                    key={d.id}
                    style={styles.deviceRow}
                    onPress={() => onPair(d.id, d.name || 'Unknown')}
                    disabled={connectingId !== null}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deviceName}>{d.name || 'Unnamed device'}</Text>
                      <Text style={styles.deviceMeta}>{d.id} · RSSI {d.rssi ?? '?'}</Text>
                    </View>
                    {connectingId === d.id
                      ? <RingSpinner size={20} />
                      : <Text style={styles.devicePair}>Pair →</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </>
    )}

    <View style={[styles.btnRow, { marginTop: SPACING.lg }]}>
      <TouchableOpacity style={styles.secondaryBtn} onPress={onBack}>
        <Text style={styles.secondaryBtnText}>← Back</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={onNext}>
        <Text style={styles.primaryBtnText}>
          {pairedDevice ? 'Next →' : 'Skip for now →'}
        </Text>
      </TouchableOpacity>
    </View>
  </View>
);

// ─── About — Name · DOB · Gender · Religion · all in one screen ──

const About = ({
  name, dob, heightCm, weightKg, gender, religion,
  onName, onDob, onHeight, onWeight, onGender, onReligion,
  onBack, onNext,
}: {
  name: string;
  dob: string;
  heightCm: string;
  weightKg: string;
  gender: Gender | null;
  religion: Religion | null;
  onName: (s: string) => void;
  onDob: (s: string) => void;
  onHeight: (s: string) => void;
  onWeight: (s: string) => void;
  onGender: (g: Gender) => void;
  onReligion: (r: Religion) => void;
  onBack: () => void;
  onNext: () => void;
}) => (
  <View style={styles.stepContent}>
    <Text style={styles.stepLabel}>STEP 3 OF 4</Text>
    <Text style={styles.title}>About you</Text>
    <Text style={styles.subtitle}>
      Helps the AI personalise your daily plan. All optional — tap Skip if you&apos;d
      rather not share.
    </Text>

    <Text style={styles.fieldLabel}>Your name</Text>
    <TextInput
      style={styles.input}
      placeholder="e.g. Lakshmi Pavani"
      placeholderTextColor={COLORS.muted}
      value={name}
      onChangeText={onName}
    />

    <Text style={[styles.fieldLabel, { marginTop: SPACING.md }]}>Date of birth</Text>
    <TextInput
      style={styles.input}
      placeholder="YYYY-MM-DD"
      placeholderTextColor={COLORS.muted}
      value={dob}
      onChangeText={onDob}
    />
    <Text style={styles.hint}>Used for age-band baseline in your AI plan.</Text>

    {/* Height + Weight — sit next to DOB so the AI plan engine has the
        full anthropometrics to work with. Both are optional. */}
    <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>Height (cm)</Text>
        <TextInput
          style={styles.input}
          placeholder="170"
          placeholderTextColor={COLORS.muted}
          value={heightCm}
          onChangeText={onHeight}
          keyboardType="numeric"
          maxLength={3}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>Weight (kg)</Text>
        <TextInput
          style={styles.input}
          placeholder="65"
          placeholderTextColor={COLORS.muted}
          value={weightKg}
          onChangeText={onWeight}
          keyboardType="numeric"
          maxLength={3}
        />
      </View>
    </View>

    <Text style={[styles.fieldLabel, { marginTop: SPACING.md }]}>Gender</Text>
    <View style={styles.gridRow}>
      {GENDERS.map(g => (
        <TouchableOpacity
          key={g.id}
          style={[styles.gridChip, gender === g.id && styles.gridChipActive]}
          onPress={() => onGender(g.id)}
        >
          <Text style={styles.gridChipIcon}>{g.icon}</Text>
          <Text style={[styles.gridChipLabel, gender === g.id && styles.gridChipLabelActive]}>
            {g.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>

    <Text style={[styles.fieldLabel, { marginTop: SPACING.md }]}>Religion / spiritual lean</Text>
    <View style={styles.gridRow}>
      {RELIGIONS.map(r => (
        <TouchableOpacity
          key={r.id}
          style={[styles.gridChip, religion === r.id && styles.gridChipActive]}
          onPress={() => onReligion(r.id)}
        >
          <Text style={styles.gridChipIcon}>{r.icon}</Text>
          <Text style={[styles.gridChipLabel, religion === r.id && styles.gridChipLabelActive]}>
            {r.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
    <Text style={styles.hint}>Tunes the festival calendar to your tradition.</Text>

    <View style={[styles.btnRow, { marginTop: SPACING.lg }]}>
      <TouchableOpacity style={styles.secondaryBtn} onPress={onBack}>
        <Text style={styles.secondaryBtnText}>← Back</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={onNext}>
        <Text style={styles.primaryBtnText}>Continue →</Text>
      </TouchableOpacity>
    </View>
  </View>
);

// ─── Plan prompt — final step before entering the app ────────────

const PlanPrompt = ({
  onPlanNow, onSkip, onBack,
}: {
  onPlanNow: () => void;
  onSkip: () => void;
  onBack: () => void;
}) => (
  <View style={styles.stepContent}>
    <Text style={styles.stepLabel}>STEP 4 OF 4</Text>
    <Text style={styles.title}>Plan your well-being?</Text>
    <Text style={styles.subtitle}>
      Set up your daily walk · yoga · japa · meditation now — or jump
      straight to the dashboard and plan later.
    </Text>

    <TouchableOpacity style={styles.planCta} onPress={onPlanNow}>
      <Text style={styles.planCtaIcon}>🌿</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.planCtaTitle}>Plan your well-being now</Text>
        <Text style={styles.planCtaSub}>AI suggests a starter plan from your age + vitals</Text>
      </View>
      <Text style={styles.planCtaArrow}>→</Text>
    </TouchableOpacity>

    <TouchableOpacity style={styles.planSkipBtn} onPress={onSkip}>
      <Text style={styles.planSkipText}>Skip for now · take me to the dashboard</Text>
    </TouchableOpacity>

    <TouchableOpacity style={[styles.secondaryBtn, { alignSelf: 'center', marginTop: SPACING.lg }]} onPress={onBack}>
      <Text style={styles.secondaryBtnText}>← Back</Text>
    </TouchableOpacity>
  </View>
);

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  scroll: {
    paddingTop: 50,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  title: {
    fontSize: 28,
    color: COLORS.cream,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: SPACING.lg,
    textAlign: 'center',
    lineHeight: 19,
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

  // ── v71: OTP step ──
  otpDemoBanner: {
    marginTop: SPACING.md, padding: SPACING.md, borderRadius: 10,
    backgroundColor: 'rgba(255,184,0,0.10)', borderWidth: 1, borderColor: 'rgba(255,184,0,0.35)',
    alignItems: 'center',
  },
  otpDemoText: { color: COLORS.muted, fontSize: 12, textAlign: 'center', fontStyle: 'italic' },
  otpDemoCode: { color: COLORS.gold, fontSize: 26, fontWeight: '800', letterSpacing: 6, marginTop: 6 },
  otpInput: {
    marginTop: SPACING.lg, backgroundColor: COLORS.cardBg, borderRadius: 12,
    paddingVertical: SPACING.md, color: COLORS.cream, fontSize: 30, fontWeight: '800',
    letterSpacing: 12, borderWidth: 1, borderColor: COLORS.gold,
  },

  // ── Grid of selectable chips (gender, religion) ──
  gridRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 8, marginBottom: 4,
  },
  gridChip: {
    minWidth: '30%', flexGrow: 1,
    paddingVertical: 10, paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  gridChipActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(212,160,23,0.15)',
  },
  gridChipIcon: { fontSize: 20, marginBottom: 4 },
  gridChipLabel: { fontSize: 12, color: COLORS.cream, fontWeight: '600' },
  gridChipLabelActive: { color: COLORS.gold, fontWeight: '700' },

  // ── Bluetooth pairing banners + rows ──
  demoBanner: {
    backgroundColor: 'rgba(255, 140, 66, 0.12)',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.saffron,
    padding: SPACING.md,
    borderRadius: 8,
    marginVertical: SPACING.md,
  },
  demoBannerTitle: { fontSize: 12, color: COLORS.saffron, fontWeight: '700', marginBottom: 4 },
  demoBannerText: { fontSize: 11, color: COLORS.muted, lineHeight: 16 },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 6,
  },
  deviceName: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  deviceMeta: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  devicePair: { fontSize: 13, color: COLORS.gold, fontWeight: '700' },

  // ── Toggle (email | phone) ──
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

  // ── Buttons ──
  primaryBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    minHeight: 52,
  },
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

  // ── Plan prompt CTA ──
  planCta: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(80, 200, 180, 0.10)',
    borderRadius: 14,
    borderWidth: 1, borderColor: '#7FE8C8',
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  planCtaIcon: { fontSize: 32, marginRight: SPACING.md },
  planCtaTitle: { color: COLORS.cream, fontSize: 15, fontWeight: '700' },
  planCtaSub:   { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  planCtaArrow: { fontSize: 22, color: '#7FE8C8', fontWeight: '700', marginLeft: 6 },

  planSkipBtn: {
    marginTop: SPACING.md, paddingVertical: 14,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  planSkipText: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },

  // ── Google Sign-In button ──
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: SPACING.lg,
    borderRadius: 12,
    marginTop: SPACING.lg,
    minHeight: 56,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  googleG: {
    fontSize: 22, color: '#4285F4', fontWeight: '900', marginRight: 12,
  },
  googleBtnText: { color: '#1a1a1a', fontSize: 16, fontWeight: '700' },
  googleHint: {
    fontSize: 12, color: COLORS.muted, fontStyle: 'italic',
    textAlign: 'center', marginTop: SPACING.md, lineHeight: 17,
    paddingHorizontal: SPACING.md,
  },
  skipBtn: {
    marginTop: SPACING.md,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  skipBtnText: { color: COLORS.cream, fontSize: 13, fontWeight: '500' },
});

// ─── Welcome-screen styles (separate for visual isolation) ───────

const welcomeStyles = StyleSheet.create({
  root: {
    paddingTop: 120,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 600,
  },
  ring: {
    position: 'absolute',
    top: 90,
    width: 260, height: 260, borderRadius: 130,
    borderWidth: 1, borderColor: 'rgba(255, 224, 102, 0.30)',
    borderStyle: 'dashed',
  },
  glow: {
    position: 'absolute',
    top: 130,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255, 184, 0, 0.30)',
    shadowColor: '#FFB800',
    shadowOpacity: 1,
    shadowRadius: 60,
    elevation: 30,
  },
  lotusWrap: {
    width: 160, height: 160,
    alignItems: 'center', justifyContent: 'center',
  },
  lotus: { fontSize: 110 },

  titleBlock: {
    marginTop: 30,
    alignItems: 'center',
  },
  brand: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.cream,
    letterSpacing: 4,
    marginBottom: 8,
    textShadowColor: '#FFB800',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  tagline: {
    fontSize: 13,
    color: COLORS.gold,
    fontStyle: 'italic',
    letterSpacing: 1.5,
  },
});
