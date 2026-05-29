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

const SYSTEM_PROMPT = `
You are a kind, patient voice assistant inside a Hindu spiritual-wellness
app called "Body & Soul Ring" used by elderly devotees. The user has
spoken to you in their own language. Your job:

1. Detect the language (English, Hindi, Tamil, Telugu, Kannada, Marathi,
   Bengali, etc.) and respond in the SAME language.
2. Decide what they want from this list of supported actions:
   - "navigate"          → Move them to a tab. target ∈ {"Dashboard","Plan","Exercise","Yoga","Japa","Meditation","Panchang","History"}
   - "explain_vitals"    → They want to hear about their BPM/HRV/SpO₂
   - "explain_goals"     → They want to hear their committed routines
   - "explain_routine"   → They want to know what to do today
   - "set_reminder"      → They want a reminder. params: { activity, time }
   - "add_goal"          → They want to add a routine item. params: { activity, durationMin }
   - "chat"              → Just conversation, no action
   - "unknown"           → If unclear
3. Speak warmly and slowly — these are elders. Acknowledge their question
   before answering. Use loving terms appropriate to the language (e.g.
   "namaste", "ji").

OUTPUT ONLY VALID JSON in this exact shape:
{
  "action": "...",
  "target": "...",            // optional
  "params": { ... },          // optional
  "speech": "...",            // what to say back in user's language
  "language": "..."           // BCP-47 tag: en, hi, ta, te, kn, mr, bn, en-IN, etc.
}
Do NOT wrap in markdown or add commentary outside the JSON.
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

      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={fabWrap.btn}>
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
          <Circle cx={32} cy={32} r={28} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={1} />

          {/* Lotus petals flanking the mic */}
          <G transform="translate(32 38)">
            <Path d="M -16 -2 Q -22 6, -16 12 Q -10 6, -16 -2 Z"
                  fill="#FFE066" opacity={0.75} />
            <Path d="M 16 -2 Q 22 6, 16 12 Q 10 6, 16 -2 Z"
                  fill="#FFE066" opacity={0.75} />
            <Path d="M 0 -8 Q -6 0, 0 6 Q 6 0, 0 -8 Z"
                  fill="#FFE066" opacity={0.55} />
          </G>

          {/* Microphone glyph */}
          <G transform="translate(32 30)">
            {/* Capsule */}
            <Rect x={-6} y={-12} width={12} height={20} rx={6} ry={6}
                  fill="url(#vfMic)" stroke="rgba(80,40,0,0.25)" strokeWidth={0.8} />
            {/* U-bracket */}
            <Path d="M -10 4 Q -10 14, 0 14 Q 10 14, 10 4"
                  stroke="url(#vfMic)" strokeWidth={2.2} fill="none" strokeLinecap="round" />
            {/* Stem */}
            <Rect x={-1.2} y={14} width={2.4} height={4.5} fill="url(#vfMic)" />
            {/* Base */}
            <Rect x={-7} y={18} width={14} height={2.6} rx={1.3} ry={1.3} fill="url(#vfMic)" />
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
});

export const VoiceAssistant: React.FC<Props> = ({ navRef, bottom = 100 }) => {
  const { showToast } = useSadhana();
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [responding, setResponding] = useState(false);
  const [lastResponse, setLastResponse] = useState<VoiceAction | null>(null);
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
  useSpeechRecognitionEvent('start',  () => setListening(true));
  useSpeechRecognitionEvent('end',    () => setListening(false));
  useSpeechRecognitionEvent('result', (event: any) => {
    const text = event?.results?.[0]?.transcript ?? '';
    if (!text) return;
    setTranscript(text);
    // If the recognizer marks this as the final result, fire Gemma.
    if (event?.isFinal) {
      ExpoSpeechRecognitionModule.stop();
      handleTranscript(text);
    }
  });
  useSpeechRecognitionEvent('error', (e: any) => {
    setListening(false);
    console.warn('[STT] error', e?.error, e?.message);
  });

  // ── Cross-platform listen() ──
  const listen = async () => {
    setTranscript('');
    setLastResponse(null);

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
        showToast('Microphone permission denied — please enable in Settings');
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
    } catch (e: any) {
      console.warn('[STT] start failed', e?.message);
      showToast('Voice unavailable — please type your request');
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
    setResponding(true);
    try {
      const raw = await defaultGemmaClient.generate({
        systemPrompt: SYSTEM_PROMPT,
        userMessage: text,
        params: { temperature: 0.4, max_new_tokens: 400 },
      });
      const json = extractJson(raw);
      if (!json) throw new Error('No JSON in response');
      const action: VoiceAction = { request: text, ...json };
      setLastResponse(action);

      // Execute the action
      executeAction(action);

      // Speak the response back
      if (action.speech) {
        Speech.speak(action.speech, {
          language: action.language || 'en-IN',
          pitch: 1.0,
          rate: 0.92,
        });
      }
    } catch (e) {
      const fallback = "I'm sorry, I couldn't understand. Could you say that again?";
      setLastResponse({
        request: text, action: 'unknown',
        speech: fallback, language: 'en-IN',
      });
      Speech.speak(fallback, { language: 'en-IN', rate: 0.92 });
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
              Tap 🎤 to speak — or type below. I'll answer in your language and take action.
            </Text>

            {/* Mic visualizer */}
            <View style={styles.micRow}>
              <Animated.View style={[styles.micPulse, { transform: [{ scale: pulse }] }]} />
              <Text style={styles.micEmoji}>
                {listening ? '🔴' : responding ? '⏳' : '🎤'}
              </Text>
            </View>

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

            {/* Listen button — wired to expo-speech-recognition on native
                so users can talk; web uses the browser API. */}
            <View style={styles.btnRow}>
              {listening ? (
                <TouchableOpacity style={styles.stopBtn} onPress={stopListening}>
                  <Text style={styles.stopBtnText}>⏹  Stop listening</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.listenBtn} onPress={listen}>
                  <Text style={styles.listenBtnText}>🎤  Tap to speak</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.examples}>
              Try:  "Take me to japa"  ·  "What's my routine today?"  ·{' '}
              "Remind me to meditate at 6 am"  ·  "Explain my vitals"
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
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(212,160,23,0.25)',
  },
  micEmoji: { fontSize: 44 },

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
