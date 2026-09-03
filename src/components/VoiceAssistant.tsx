/**
 * VoiceAssistant — a multilingual voice helper for elderly users.
 *
 *   • Floating 🎤 button (FAB) bottom-right of the screen.
 *   • Tap → opens a modal that listens, transcribes, asks Gemma to
 *     parse intent, performs the action, and speaks the response back.
 *   • Works in any language the device's speech recognizer supports
 *     (auto-detected from the browser / device locale).
 *
 *   Supported intents:
 *     - navigate (Home / Plan / Exercise / Yoga / Japa / Meditate / Panchang / Insights)
 *     - explain_vitals     ("how are my vitals today?")
 *     - explain_goals      ("what are my goals?")
 *     - explain_routine    ("what should I do today?")
 *     - set_reminder       ("remind me to japa at 6 am")
 *     - add_goal           ("I want to walk 30 min daily")
 *     - help / chat        free-form conversation, no app action
 *
 * Cross-platform STT:
 *   - Web   → browser SpeechRecognition API
 *   - Native → fallback text input (expo-speech-recognition can be
 *     wired later — out of scope for this commit)
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Platform, TextInput, Animated, Easing,
} from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop, Rect, Path, G, LinearGradient } from 'react-native-svg';
import * as ExpoSpeech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { COLORS, SPACING } from '../theme';
import { defaultGemmaClient } from '../soulsync/ai/GemmaClient';
import { useSadhana } from '../context';
import { routineRepo, RoutineCategory } from '../services/routineRepo';
import { scheduleRoutineReminder, requestNotificationPermission } from '../services/notifications';

// ─── Cross-platform TTS shim ──────────────────────────────────────
// On WEB: uses the browser's SpeechSynthesis API.
// On NATIVE (iOS / Android): uses expo-speech which talks to the
// system's native TTS engine — same engine used by accessibility tools
// so it's fluent in every Indian language the device supports.
const Speech = {
  speak(text: string, opts?: { language?: string; rate?: number; pitch?: number }) {
    if (Platform.OS === 'web') {
      try {
        const synth = (typeof window !== 'undefined') ? (window as any).speechSynthesis : null;
        if (!synth) return;
        const u = new (window as any).SpeechSynthesisUtterance(text);
        if (opts?.language) u.lang = opts.language;
        if (opts?.rate)     u.rate = opts.rate;
        if (opts?.pitch)    u.pitch = opts.pitch;
        synth.cancel();
        synth.speak(u);
      } catch { /* TTS optional */ }
      return;
    }
    // Native — expo-speech wraps Android TextToSpeech / iOS AVSpeechSynthesizer.
    try {
      ExpoSpeech.stop();
      ExpoSpeech.speak(text, {
        language: opts?.language || 'en-IN',
        rate: opts?.rate ?? 0.92,
        pitch: opts?.pitch ?? 1.0,
      });
    } catch { /* TTS optional */ }
  },
  stop() {
    if (Platform.OS === 'web') {
      try { (window as any).speechSynthesis?.cancel(); } catch { /* */ }
      return;
    }
    try { ExpoSpeech.stop(); } catch { /* */ }
  },
};

interface Props {
  /** React-Navigation ref so the assistant can navigate. */
  navRef: React.RefObject<any>;
  /** Optional bottom offset (above the tab bar). */
  bottom?: number;
}

interface VoiceAction {
  /** Spoken / typed user request (raw transcript). */
  request: string;
  /** Gemma's parsed action. */
  action: 'navigate' | 'explain_vitals' | 'explain_goals' | 'explain_routine'
        | 'set_reminder' | 'add_goal' | 'chat' | 'unknown';
  /** Target screen for navigate / open-modal. */
  target?: string;
  /** Parameters (time, activity, etc.). */
  params?: Record<string, any>;
  /** Friendly response to speak back to the user. */
  speech: string;
  /** Detected language tag for TTS (e.g. 'en', 'hi', 'ta'). */
  language: string;
}

// v56: aggressively shortened from ~30 lines → 12 to cut Gemma latency.
// Same intent surface (8 actions), fewer tokens to read = faster first
// byte from the model. Output spec held tight to keep JSON parse robust.
const SYSTEM_PROMPT = `
You are a voice assistant in a Hindu wellness app for elders.
Detect the user's language and reply in the SAME language, warmly, briefly.
Output ONLY this JSON (no markdown, no extra text):
{"action":"<a>","target":"<t>","params":{},"speech":"<reply>","language":"<bcp47>"}
Where <a> is one of:
  navigate (target ∈ Dashboard Plan Exercise Yoga Japa Meditation Panchang History)
  explain_vitals | explain_goals | explain_routine
  set_reminder  (params: {activity,time})
  add_goal      (params: {activity,durationMin})
  chat | unknown
Keep speech under 30 words.
`.trim();

// ─── Beautiful Voice FAB ────────────────────────────────────────
//
// A 64×64 SVG button with:
//   • Soft outer halo that breathes (scale + opacity) when idle
//   • Radial gold-→-saffron gradient body
//   • White microphone glyph (vector, not emoji)
//   • Two lotus petal accents flanking the mic for the spiritual brand
//   • Cream stand for visual grounding

const VoiceFab: React.FC<{ bottom: number; onPress: () => void }> = ({ bottom, onPress }) => {
  const halo = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Gentle 3-second breath cycle on the halo when idle
    Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(halo, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [halo]);

  const haloScale   = halo.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.15] });
  const haloOpacity = halo.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });

  return (
    <View pointerEvents="box-none" style={[fabWrap.wrap, { bottom: bottom - 6 }]}>
      {/* Ambient halo */}
      <Animated.View
        pointerEvents="none"
        style={[
          fabWrap.halo,
          { transform: [{ scale: haloScale }], opacity: haloOpacity },
        ]}
      />

      {/* v55: explicit "Voice" label below the orb so users can't miss it */}
      <Text style={fabWrap.label} pointerEvents="none">🎙️ Voice</Text>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={fabWrap.btn}
        hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
      >
        <Svg width={64} height={64} viewBox="0 0 64 64">
          <Defs>
            <RadialGradient id="vfBg" cx="50%" cy="42%" r="60%">
              <Stop offset="0%"   stopColor="#FFE07A" />
              <Stop offset="55%"  stopColor="#FFB800" />
              <Stop offset="100%" stopColor="#C57600" />
            </RadialGradient>
            <LinearGradient id="vfMic" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor="#FFF8E1" />
              <Stop offset="100%" stopColor="#F0E0B0" />
            </LinearGradient>
          </Defs>

          {/* Outer body — gold gradient */}
          <Circle cx={32} cy={32} r={30} fill="url(#vfBg)" />
          {/* Inner sheen ring */}
          <Circle cx={32} cy={32} r={28} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={1.2} />

          {/* v56 clean Samsung / Material style mic.
              Single-tone deep-brown glyph centred on the gold orb —
              rounded capsule head, slim U-bracket, clean stem + base.
              Centred at (32, 30) so it sits in the optical centre of
              the circle (slightly above geometric centre). */}
          <G transform="translate(32 30)" fill="#2A1A00" stroke="none">
            {/* Mic head — rounded capsule */}
            <Rect x={-7} y={-16} width={14} height={22} rx={7} ry={7} fill="#2A1A00" />
            {/* Subtle highlight on the head for depth */}
            <Rect x={-5} y={-14} width={3.2} height={9} rx={1.6} ry={1.6} fill="rgba(255,240,200,0.55)" />
            {/* U-bracket (stand) */}
            <Path
              d="M -12 4 V 6 C -12 12.6 -6.6 18 0 18 C 6.6 18 12 12.6 12 6 V 4"
              fill="none"
              stroke="#2A1A00"
              strokeWidth={3}
              strokeLinecap="round"
            />
            {/* Stem */}
            <Rect x={-1.6} y={18} width={3.2} height={4} fill="#2A1A00" />
            {/* Base */}
            <Rect x={-9} y={22} width={18} height={3.2} rx={1.6} ry={1.6} fill="#2A1A00" />
          </G>
        </Svg>
      </TouchableOpacity>
    </View>
  );
};

const fabWrap = StyleSheet.create({
  wrap: {
    position: 'absolute', right: SPACING.md,
    width: 96, height: 96, alignItems: 'center', justifyContent: 'center',
    zIndex: 999,
  },
  halo: {
    position: 'absolute',
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(255, 184, 0, 0.45)',
    // Soft glow ring rather than a hard fill
    shadowColor: '#FFB800', shadowRadius: 18, shadowOpacity: 0.9,
    shadowOffset: { width: 0, height: 0 },
  },
  btn: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  label: {
    position: 'absolute', bottom: -2,
    fontSize: 11, color: '#FFE066', fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 1000,
  },
});

export const VoiceAssistant: React.FC<Props> = ({ navRef, bottom = 100 }) => {
  const { showToast } = useSadhana();
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [responding, setResponding] = useState(false);
  const [lastResponse, setLastResponse] = useState<VoiceAction | null>(null);
  // v55: in-modal status line so users see exactly what's happening
  // ("Asking for mic permission…", "Listening…", "Thinking…", error msg).
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<'info' | 'error'>('info');
  const recogRef = useRef<any>(null);
  const textInputRef = useRef<TextInput | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  // When the modal opens on native, focus the text input so the user
  // can start typing immediately.  Voice listening is web-only until
  // expo-speech-recognition is wired in (next APK).
  useEffect(() => {
    if (open && Platform.OS !== 'web') {
      const t = setTimeout(() => textInputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Mic pulse animation while listening
  useEffect(() => {
    if (!listening) { pulse.stopAnimation(); pulse.setValue(1); return; }
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.25, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0,  duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [listening, pulse]);

  // ── Native STT events (Android / iOS) ──
  // useSpeechRecognitionEvent must be unconditionally subscribed; the
  // module is a no-op when nothing is recording.
  useSpeechRecognitionEvent('start', () => {
    setListening(true);
    setStatusKind('info');
    setStatusMsg('🎙️  Listening… speak now');
  });
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    // Clear "Listening…" once recording stops (handleTranscript will
    // set "Thinking…" of its own).
    setStatusMsg(prev => (prev?.startsWith('🎙️') ? null : prev));
  });
  useSpeechRecognitionEvent('result', (event: any) => {
    const text = event?.results?.[0]?.transcript ?? '';
    if (!text) return;
    setTranscript(text);
    // If the recognizer marks this as the final result, fire Gemma.
    if (event?.isFinal) {
      try { ExpoSpeechRecognitionModule.stop(); } catch { /* */ }
      handleTranscript(text);
    }
  });
  useSpeechRecognitionEvent('error', (e: any) => {
    setListening(false);
    const code = e?.error || 'unknown';
    const msg  = e?.message || '';
    console.warn('[STT] error', code, msg);
    setStatusKind('error');
    // Map the common codes to friendly user-facing messages
    if (code === 'no-speech') {
      setStatusMsg('🤐  Didn\'t hear anything — tap "Tap to speak" and try again.');
    } else if (code === 'service-not-allowed' || code === 'not-allowed') {
      setStatusMsg('🔒  Microphone permission denied. Enable it in Settings → Apps → Body & Soul Ring.');
    } else if (code === 'language-not-supported') {
      setStatusMsg('🌐  This language isn\'t supported by the device speech engine.');
    } else if (code === 'network') {
      setStatusMsg('📡  Network error — connect to the internet and try again.');
    } else {
      setStatusMsg(`⚠️  Voice error: ${code}${msg ? ` · ${msg}` : ''}`);
    }
  });

  // ── Cross-platform listen() ──
  const listen = async () => {
    setTranscript('');
    setLastResponse(null);
    setStatusKind('info');
    setStatusMsg('🎤  Asking for microphone permission…');

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        setTranscript('(Speech recognition not available in this browser)');
        return;
      }
      const r = new SR();
      r.lang = navigator.language || 'en-IN';   // browser locale
      r.interimResults = true;
      r.continuous = false;
      r.maxAlternatives = 1;
      r.onstart  = () => setListening(true);
      r.onend    = () => setListening(false);
      r.onerror  = (e: any) => { setListening(false); console.warn('STT error', e); };
      r.onresult = (e: any) => {
        const text = Array.from(e.results).map((res: any) => res[0].transcript).join(' ');
        setTranscript(text);
        if (e.results[e.results.length - 1].isFinal) {
          handleTranscript(text);
        }
      };
      try { r.start(); } catch { /* already started */ }
      recogRef.current = r;
      return;
    }

    // ── Native: expo-speech-recognition ──
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setStatusKind('error');
        setStatusMsg('🔒  Microphone permission denied. Enable it in Settings → Apps → Body & Soul Ring → Permissions.');
        showToast('Mic permission denied');
        return;
      }
      // Honour the device locale for multilingual users
      const lang = 'en-IN';   // a reasonable default; Gemma detects + translates
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
      });
      // The 'start' event will flip statusMsg to "🎙️ Listening…"
    } catch (e: any) {
      console.warn('[STT] start failed', e?.message);
      setStatusKind('error');
      setStatusMsg(`⚠️  Couldn't start voice (${e?.message || 'unknown'}). Type your request below instead.`);
    }
  };

  const stopListening = () => {
    if (Platform.OS === 'web') {
      if (recogRef.current?.stop) recogRef.current.stop();
    } else {
      try { ExpoSpeechRecognitionModule.stop(); } catch { /* */ }
    }
    setListening(false);
  };

  // ── Send transcript to Gemma → execute action → speak back ──
  const handleTranscript = async (text: string) => {
    if (!text.trim()) return;
    setStatusKind('info');
    setStatusMsg('💭  Thinking…');
    setResponding(true);
    const t0 = Date.now();
    try {
      // v56 perf knobs:
      //   • temperature 0.4 → 0.2  (less variation, faster sampling)
      //   • max_new_tokens 400 → 180  (replies are short anyway)
      //   • shorter SYSTEM_PROMPT (see top of file)
      //   • TTS started as soon as we have `speech`; action persistence
      //     runs in parallel via Promise.resolve().then(...)
      const raw = await defaultGemmaClient.generate({
        systemPrompt: SYSTEM_PROMPT,
        userMessage: text,
        params: { temperature: 0.2, max_new_tokens: 180 },
      });
      const tGemma = Date.now();
      console.log(`[Voice] Gemma ${tGemma - t0}ms`);

      const json = extractJson(raw);
      if (!json) throw new Error('No JSON in response');
      const action: VoiceAction = { request: text, ...json };
      setLastResponse(action);
      setStatusMsg('🗣️  Speaking…');

      // Start TTS immediately (don't wait for any DB writes)
      if (action.speech) {
        Speech.speak(action.speech, {
          language: action.language || 'en-IN',
          pitch: 1.0,
          rate: 0.96,
        });
      }
      // Persist + navigate in PARALLEL with TTS speaking
      Promise.resolve().then(() => executeAction(action)).catch((e) => {
        console.warn('[Voice] action failed', e);
      });

      // Clear status once spoken
      setTimeout(() => setStatusMsg(prev => (prev?.startsWith('🗣️') ? null : prev)), 1500);
      console.log(`[Voice] total ${Date.now() - t0}ms`);
    } catch (e: any) {
      console.warn(`[Voice] error after ${Date.now() - t0}ms`, e?.message);
      const fallback = "I'm sorry, I couldn't understand. Could you say that again?";
      setLastResponse({
        request: text, action: 'unknown',
        speech: fallback, language: 'en-IN',
      });
      setStatusKind('error');
      setStatusMsg(`⚠️  Couldn't reach the assistant. ${e?.message || ''}`);
      Speech.speak(fallback, { language: 'en-IN', rate: 0.96 });
    } finally {
      setResponding(false);
    }
  };

  // ── Action persistence helpers ──────────────────────────────────
  // The Gemma intent parser returns structured params (e.g. { activity:
  // "walk", durationMin: 30, time: "06:00" }).  These helpers actually
  // PERSIST the action so Gemma's response feels real — not just a
  // spoken acknowledgement followed by a navigate.

  const inferCategory = (activity: string): RoutineCategory => {
    const a = (activity || '').toLowerCase();
    if (/walk|run|jog|cycle|swim|gym|hiit|workout|cardio/.test(a)) return 'exercise';
    if (/yoga|asana|surya|namaskar|pranayama/.test(a))             return 'yoga';
    if (/japa|mantra|mala|gayatri|om/.test(a))                     return 'japa';
    if (/meditat|breath|mindful/.test(a))                          return 'meditate';
    if (/sandhya|pratah|sayam|madhyahnika/.test(a))                return 'sandhya';
    if (/shradh|tithi|ekadashi|pradosh/.test(a))                   return 'tithi';
    return 'meditate';
  };

  const persistAddGoal = async (params: any) => {
    const activity = String(params?.activity || params?.name || 'practice');
    const minutes  = Number(params?.durationMin || params?.minutes || 15);
    const time     = params?.time ? String(params.time) : null;
    await routineRepo.add({
      category:    inferCategory(activity),
      name:        activity.charAt(0).toUpperCase() + activity.slice(1),
      durationMin: Math.max(1, Math.round(minutes)),
      time,
      frequency:   'daily',
      custom:      true,
    });
    showToast(`✓ Added "${activity}" · ${minutes} min daily`);
  };

  const persistReminder = async (params: any) => {
    const activity = String(params?.activity || params?.name || 'practice');
    const time     = String(params?.time || '07:00');
    const minutes  = Number(params?.durationMin || params?.minutes || 10);
    const cat      = inferCategory(activity);
    // Add the routine item so the reminder has something to point at,
    // then schedule the notification via the existing helper.
    const item = await routineRepo.add({
      category:    cat,
      name:        activity.charAt(0).toUpperCase() + activity.slice(1),
      durationMin: Math.max(1, Math.round(minutes)),
      time,
      frequency:   'daily',
      custom:      true,
    });
    const granted = await requestNotificationPermission();
    if (granted) {
      const ids = await scheduleRoutineReminder({
        title: `🔔 ${item.name}`,
        body:  `Time for your ${minutes}-min ${cat}`,
        time,
        frequency: 'daily',
        routineId: item.id,
      });
      await routineRepo.update(item.id, { notificationIds: ids });
    }
    showToast(`⏰ Reminder set for ${time} daily`);
  };

  const executeAction = async (a: VoiceAction) => {
    switch (a.action) {
      case 'navigate':
        if (a.target && navRef.current?.navigate) {
          navRef.current.navigate(a.target);
          setTimeout(() => setOpen(false), 600);
        }
        break;
      case 'explain_vitals':
        if (navRef.current?.navigate) navRef.current.navigate('Dashboard');
        break;
      case 'explain_goals':
      case 'explain_routine':
        if (navRef.current?.navigate) navRef.current.navigate('Plan');
        break;
      case 'add_goal':
        try {
          await persistAddGoal(a.params || {});
          if (navRef.current?.navigate) navRef.current.navigate('Plan');
        } catch (e: any) {
          showToast(`Couldn't add goal: ${e?.message || 'unknown'}`);
        }
        break;
      case 'set_reminder':
        try {
          await persistReminder(a.params || {});
          if (navRef.current?.navigate) navRef.current.navigate('Plan');
        } catch (e: any) {
          showToast(`Couldn't set reminder: ${e?.message || 'unknown'}`);
        }
        break;
      case 'chat':
      case 'unknown':
      default:
        break;
    }
  };

  return (
    <>
      {/* Floating Voice Assistant — beautiful SVG button with breathing halo */}
      <VoiceFab bottom={bottom} onPress={() => setOpen(true)} />

      {/* Voice modal */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>🎤  Voice Assistant</Text>
              <TouchableOpacity
                onPress={() => { stopListening(); Speech.stop(); setOpen(false); }}
                hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              >
                <Text style={styles.close}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
              Tap 🎤 to speak — or type below. I&apos;ll answer in your language and take action.
            </Text>

            {/* v55: the mic visualizer is now the PRIMARY tap target —
                a huge circular button that toggles listen/stop. Visible
                state changes (🎤 → 🔴 → ⏳) make it obvious what's
                happening. Older users can't miss this. */}
            <TouchableOpacity
              style={styles.micButton}
              onPress={listening ? stopListening : (responding ? undefined : listen)}
              activeOpacity={0.7}
              disabled={responding}
            >
              <Animated.View style={[styles.micPulse, { transform: [{ scale: pulse }] }]} />
              <Text style={styles.micEmoji}>
                {listening ? '🔴' : responding ? '⏳' : '🎤'}
              </Text>
              <Text style={styles.micButtonLabel}>
                {listening ? 'Tap to STOP' : responding ? 'Thinking…' : 'Tap to SPEAK'}
              </Text>
            </TouchableOpacity>

            {/* In-modal status banner — shows mic permission progress,
                listening state, errors, etc. so the user always knows
                what just happened. */}
            {statusMsg && (
              <View style={[
                styles.statusBanner,
                statusKind === 'error' && styles.statusBannerError,
              ]}>
                <Text style={[
                  styles.statusBannerText,
                  statusKind === 'error' && styles.statusBannerTextError,
                ]}>
                  {statusMsg}
                </Text>
              </View>
            )}

            {/* Transcript */}
            {transcript && Platform.OS === 'web' ? (
              <View style={styles.transcriptBox}>
                <Text style={styles.transcriptLabel}>YOU SAID</Text>
                <Text style={styles.transcriptText}>{transcript}</Text>
              </View>
            ) : null}

            {/* Response */}
            {lastResponse?.speech ? (
              <View style={styles.responseBox}>
                <Text style={styles.responseLabel}>🪷  ASSISTANT</Text>
                <Text style={styles.responseText}>{lastResponse.speech}</Text>
                {lastResponse.action && lastResponse.action !== 'chat' && lastResponse.action !== 'unknown' && (
                  <Text style={styles.actionTag}>
                    Action: {lastResponse.action}{lastResponse.target ? ` → ${lastResponse.target}` : ''}
                  </Text>
                )}
              </View>
            ) : null}

            {/* Native: BIG text input + Send pinned together */}
            {Platform.OS !== 'web' && !listening && (
              <View style={{ marginTop: SPACING.sm }}>
                <Text style={styles.transcriptLabel}>TYPE YOUR REQUEST</Text>
                <View style={styles.nativeInputRow}>
                  <TextInput
                    ref={textInputRef}
                    style={[styles.textInput, { flex: 1 }]}
                    value={transcript}
                    onChangeText={setTranscript}
                    placeholder='e.g. "Take me to japa"'
                    placeholderTextColor={COLORS.muted}
                    multiline
                    returnKeyType="send"
                    onSubmitEditing={() => handleTranscript(transcript)}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={[styles.sendBtn, (!transcript.trim() || responding) && { opacity: 0.4 }]}
                    onPress={() => handleTranscript(transcript)}
                    disabled={!transcript.trim() || responding}
                  >
                    <Text style={styles.sendBtnText}>{responding ? '…' : 'Send'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* The mic visualizer above is now the primary listen
                control; the duplicate "Tap to speak" button was removed
                in v55 to declutter the modal. */}

            <Text style={styles.examples}>
              Try:  &quot;Take me to japa&quot;  ·  &quot;What&apos;s my routine today?&quot;  ·{' '}
              &quot;Remind me to meditate at 6 am&quot;  ·  &quot;Explain my vitals&quot;
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
};

// Strip ```json fences or extract first {…} block
const extractJson = (raw: string): any => {
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { return null; }
    }
    return null;
  }
};

const styles = StyleSheet.create({
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: COLORS.darkBg,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: SPACING.lg, paddingBottom: SPACING.xl,
    borderWidth: 1, borderColor: 'rgba(212,160,23,0.40)',
  },
  handle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { color: COLORS.cream, fontSize: 18, fontWeight: '800' },
  close: { color: COLORS.muted, fontSize: 20, padding: 4 },
  hint: { color: COLORS.muted, fontSize: 12, fontStyle: 'italic', marginBottom: SPACING.md },

  micRow: { alignItems: 'center', justifyContent: 'center', height: 90, marginVertical: SPACING.sm },
  micPulse: {
    position: 'absolute',
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(212,160,23,0.30)',
  },
  micEmoji: { fontSize: 56 },

  // v55: huge tappable mic — primary listen control
  micButton: {
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
    width: 200, height: 160, borderRadius: 100,
    marginVertical: SPACING.md,
    backgroundColor: 'rgba(212,160,23,0.10)',
    borderWidth: 2, borderColor: COLORS.gold,
  },
  micButtonLabel: {
    marginTop: 6, fontSize: 13, color: COLORS.gold,
    fontWeight: '800', letterSpacing: 1,
  },

  // v55: in-modal status banner — voice flow feedback
  statusBanner: {
    marginTop: SPACING.sm, padding: SPACING.sm,
    backgroundColor: 'rgba(212,160,23,0.12)',
    borderRadius: 10, borderLeftWidth: 3, borderLeftColor: COLORS.gold,
  },
  statusBannerError: {
    backgroundColor: 'rgba(255, 100, 100, 0.12)',
    borderLeftColor: '#ff6464',
  },
  statusBannerText: {
    color: COLORS.cream, fontSize: 13, fontWeight: '600', lineHeight: 18,
  },
  statusBannerTextError: { color: '#ffb3b3' },

  transcriptBox: {
    marginTop: SPACING.sm, padding: SPACING.sm,
    backgroundColor: 'rgba(78,168,222,0.10)',
    borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#4ea8de',
  },
  transcriptLabel: { fontSize: 10, color: '#4ea8de', fontWeight: '800', letterSpacing: 1.2 },
  transcriptText: { color: COLORS.cream, fontSize: 14, marginTop: 4 },

  responseBox: {
    marginTop: SPACING.sm, padding: SPACING.sm,
    backgroundColor: 'rgba(212,160,23,0.10)',
    borderRadius: 10, borderLeftWidth: 3, borderLeftColor: COLORS.gold,
  },
  responseLabel: { fontSize: 10, color: COLORS.gold, fontWeight: '800', letterSpacing: 1.2 },
  responseText: { color: COLORS.cream, fontSize: 14, lineHeight: 19, marginTop: 4 },
  actionTag: { color: COLORS.muted, fontSize: 10, fontStyle: 'italic', marginTop: 4 },

  textInput: {
    backgroundColor: COLORS.cardBg, borderRadius: 10, padding: SPACING.sm,
    color: COLORS.cream, fontSize: 15, borderWidth: 1, borderColor: COLORS.gold,
    minHeight: 56, marginTop: 4,
  },
  nativeInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm,
  },

  btnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  listenBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: COLORS.gold, alignItems: 'center',
  },
  listenBtnText: { color: COLORS.deep, fontWeight: '800', fontSize: 14, letterSpacing: 0.4 },
  stopBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#FF8C42', alignItems: 'center',
  },
  stopBtnText: { color: COLORS.deep, fontWeight: '800', fontSize: 14 },
  sendBtn: {
    paddingVertical: 14, paddingHorizontal: 22, borderRadius: 12,
    backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center',
    minHeight: 56, minWidth: 80,
  },
  sendBtnText: { color: COLORS.deep, fontWeight: '800', fontSize: 15 },

  examples: {
    color: COLORS.muted, fontSize: 11, fontStyle: 'italic',
    marginTop: SPACING.md, textAlign: 'center', lineHeight: 16,
  },
});
