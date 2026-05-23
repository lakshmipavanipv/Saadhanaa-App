import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Modal, TextInput, ScrollView, Platform,
} from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { insightStorage } from '../ai/insightStorage';
import { buildInsightSnapshot, generateInsights, InsightResult } from '../ai/InsightGenerator';

interface Props {
  /** Optional user name — sent to the model for a personal touch. */
  userName?: string;
}

type State =
  | { kind: 'loading' }
  | { kind: 'no_key' }
  | { kind: 'ready'; result: InsightResult; stale: boolean }
  | { kind: 'refreshing'; previous: InsightResult | null }
  | { kind: 'error'; message: string };

export const AIInsightsCard: React.FC<Props> = ({ userName }) => {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState<string | null>(null);

  const loadInitial = useCallback(async () => {
    const key = await insightStorage.getApiKey();
    setApiKeySaved(key);
    if (!key) {
      setState({ kind: 'no_key' });
      return;
    }
    const cached = await insightStorage.getCached();
    if (cached) {
      setState({ kind: 'ready', result: cached, stale: false });
      return;
    }
    const anyCached = await insightStorage.getCachedAny();
    if (anyCached) {
      setState({ kind: 'ready', result: anyCached, stale: true });
      return;
    }
    // No cache + key present → trigger first generation
    void refresh(key);
  }, []);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  const refresh = useCallback(async (overrideKey?: string) => {
    const key = overrideKey ?? (await insightStorage.getApiKey());
    if (!key) {
      setState({ kind: 'no_key' });
      return;
    }
    const previous = (await insightStorage.getCachedAny()) ?? null;
    setState({ kind: 'refreshing', previous });

    try {
      const snap = await buildInsightSnapshot(userName);
      const result = await generateInsights(snap, key);
      await insightStorage.setCached(result);
      setState({ kind: 'ready', result, stale: false });
    } catch (e: any) {
      const msg = e?.message ?? 'Unknown error';
      let friendly: string;
      if (msg.includes('GEMINI_NO_KEY'))           friendly = 'No API key configured.';
      else if (msg.includes('GEMINI_HTTP_400'))    friendly = 'Bad request — your snapshot may be too large.';
      else if (msg.includes('GEMINI_HTTP_401') || msg.includes('GEMINI_HTTP_403'))
        friendly = 'API key rejected. Double-check it in Settings.';
      else if (msg.includes('GEMINI_HTTP_429'))    friendly = 'Quota exhausted — try again later.';
      else if (msg.includes('GEMINI_PARSE'))       friendly = 'Model returned malformed JSON. Try again.';
      else                                          friendly = msg;
      setState({ kind: 'error', message: friendly });
    }
  }, [userName]);

  const saveApiKey = useCallback(async () => {
    const trimmed = apiKeyInput.trim();
    await insightStorage.setApiKey(trimmed);
    setApiKeySaved(trimmed || null);
    setShowSettings(false);
    setApiKeyInput('');
    if (trimmed) void refresh(trimmed);
    else setState({ kind: 'no_key' });
  }, [apiKeyInput, refresh]);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.title}>AI Insights</Text>
          <Text style={styles.poweredBy}>· Gemini 2.5</Text>
        </View>
        <TouchableOpacity onPress={() => { setApiKeyInput(apiKeySaved || ''); setShowSettings(true); }}>
          <Text style={styles.settingsIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      {state.kind === 'loading' && (
        <View style={styles.center}><ActivityIndicator color={COLORS.gold} /></View>
      )}

      {state.kind === 'no_key' && (
        <View>
          <Text style={styles.emptyTitle}>Personalised AI analysis is one tap away</Text>
          <Text style={styles.emptyBody}>
            Soulsync can send a summary of your Japa sessions + ring biometrics to Gemini
            and get back a kind, grounded weekly read on how your sadhana is shaping
            your body. Your data stays on-device; only the summary leaves.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowSettings(true)}>
            <Text style={styles.primaryBtnText}>Add Gemini API key</Text>
          </TouchableOpacity>
          <Text style={styles.helpLink}>
            Get a free key at aistudio.google.com/apikey
          </Text>
        </View>
      )}

      {(state.kind === 'ready' || state.kind === 'refreshing') && (() => {
        const result = state.kind === 'ready' ? state.result : state.previous;
        const refreshing = state.kind === 'refreshing';
        if (!result) {
          return (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.gold} />
              <Text style={styles.refreshHint}>Generating your first insight…</Text>
            </View>
          );
        }
        return (
          <View>
            <View style={styles.toneRow}>
              <Text style={[styles.toneChip, toneChipStyle(result.tone)]}>
                {toneLabel(result.tone)}
              </Text>
              <Text style={styles.headline} numberOfLines={2}>{result.weeklyHeadline}</Text>
            </View>

            <Section label="HEALTH" body={result.healthInsight} />
            <Section label="SPIRITUAL" body={result.spiritualInsight} />
            <Section label="INTEGRATION" body={result.integration} accent />

            {result.suggestions.length > 0 && (
              <View style={styles.suggestionsBlock}>
                <Text style={styles.sectionLabel}>SUGGESTIONS</Text>
                {result.suggestions.map((s, i) => (
                  <View key={i} style={styles.suggestionRow}>
                    <Text style={styles.suggestionBullet}>·</Text>
                    <Text style={styles.suggestionText}>{s}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.footerRow}>
              <Text style={styles.timestamp}>
                {refreshing ? 'Refreshing…' : `Generated ${timeAgo(result.generatedAt)}`}
                {state.kind === 'ready' && state.stale ? ' · stale' : ''}
              </Text>
              <TouchableOpacity onPress={() => refresh()} disabled={refreshing}>
                {refreshing
                  ? <ActivityIndicator size="small" color={COLORS.gold} />
                  : <Text style={styles.refreshBtn}>↻ Refresh</Text>}
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      {state.kind === 'error' && (
        <View>
          <Text style={styles.errorTitle}>Couldn't reach Gemini</Text>
          <Text style={styles.errorBody}>{state.message}</Text>
          <View style={styles.errorBtnRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowSettings(true)}>
              <Text style={styles.secondaryBtnText}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={() => refresh()}>
              <Text style={styles.primaryBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Settings modal */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Gemini API key</Text>
            <Text style={styles.modalSub}>
              Paste your Google AI Studio key. Stored on-device only. Get one free at{' '}
              <Text style={{ color: COLORS.gold }}>aistudio.google.com/apikey</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="AIzaSy…"
              placeholderTextColor={COLORS.muted}
              value={apiKeyInput}
              onChangeText={setApiKeyInput}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={Platform.OS !== 'web'}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={saveApiKey}>
              <Text style={styles.primaryBtnText}>Save</Text>
            </TouchableOpacity>
            {apiKeySaved && (
              <TouchableOpacity
                style={[styles.secondaryBtn, { marginTop: SPACING.sm }]}
                onPress={async () => {
                  await insightStorage.clearApiKey();
                  await insightStorage.clearCache();
                  setApiKeySaved(null);
                  setApiKeyInput('');
                  setShowSettings(false);
                  setState({ kind: 'no_key' });
                }}
              >
                <Text style={styles.secondaryBtnText}>Remove saved key</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowSettings(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────

const Section: React.FC<{ label: string; body: string; accent?: boolean }> = ({ label, body, accent }) => (
  <View style={styles.sectionBlock}>
    <Text style={[styles.sectionLabel, accent && { color: '#d6e040' }]}>{label}</Text>
    <Text style={styles.sectionBody}>{body}</Text>
  </View>
);

const toneLabel = (t: InsightResult['tone']): string => ({
  celebrating: '🎉 Celebrating',
  encouraging: '🌱 Encouraging',
  caution:     '⚠ Caution',
  neutral:     '· Neutral',
}[t]);

const toneChipStyle = (t: InsightResult['tone']) => ({
  celebrating: { backgroundColor: 'rgba(74, 222, 128, 0.15)', color: COLORS.leaf },
  encouraging: { backgroundColor: 'rgba(214, 224, 64, 0.15)', color: '#d6e040' },
  caution:     { backgroundColor: 'rgba(255, 140, 66, 0.15)', color: COLORS.saffron },
  neutral:     { backgroundColor: 'rgba(160, 160, 160, 0.15)', color: COLORS.muted },
}[t]);

const timeAgo = (epoch: number): string => {
  const s = Math.round((Date.now() - epoch) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(214, 224, 64, 0.18)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: { fontSize: 15, color: '#d6e040', fontWeight: '700', letterSpacing: 0.5 },
  poweredBy: { fontSize: 10, color: COLORS.muted, fontWeight: '500' },
  settingsIcon: { fontSize: 18, color: COLORS.muted },

  center: { alignItems: 'center', paddingVertical: SPACING.lg },
  refreshHint: { fontSize: 11, color: COLORS.muted, marginTop: SPACING.sm, fontStyle: 'italic' },

  emptyTitle: { fontSize: 14, color: COLORS.cream, fontWeight: '600', marginBottom: 6 },
  emptyBody: { fontSize: 12, color: COLORS.muted, lineHeight: 17, marginBottom: SPACING.md },
  helpLink: { fontSize: 10, color: COLORS.muted, marginTop: SPACING.sm, textAlign: 'center', fontStyle: 'italic' },

  toneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm },
  toneChip: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  headline: { flex: 1, fontSize: 13, color: COLORS.cream, fontWeight: '600' },

  sectionBlock: { marginTop: SPACING.sm },
  sectionLabel: { fontSize: 10, color: COLORS.muted, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  sectionBody: { fontSize: 13, color: COLORS.cream, lineHeight: 19 },

  suggestionsBlock: { marginTop: SPACING.md },
  suggestionRow: { flexDirection: 'row', marginTop: 4 },
  suggestionBullet: { color: '#d6e040', fontSize: 16, marginRight: 6, lineHeight: 19 },
  suggestionText: { flex: 1, fontSize: 12, color: COLORS.cream, lineHeight: 18 },

  footerRow: {
    marginTop: SPACING.md, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  timestamp: { fontSize: 10, color: COLORS.muted, fontStyle: 'italic' },
  refreshBtn: { fontSize: 12, color: COLORS.gold, fontWeight: '700' },

  errorTitle: { fontSize: 14, color: COLORS.error, fontWeight: '700', marginBottom: 4 },
  errorBody: { fontSize: 12, color: COLORS.cream, lineHeight: 17, marginBottom: SPACING.md },
  errorBtnRow: { flexDirection: 'row', gap: SPACING.sm },

  primaryBtn: {
    backgroundColor: COLORS.gold, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: SPACING.lg,
    alignItems: 'center', justifyContent: 'center',
    minHeight: 44,
  },
  primaryBtnText: { color: COLORS.deep, fontWeight: '700', fontSize: 14 },
  secondaryBtn: {
    paddingVertical: 12, paddingHorizontal: SPACING.md, borderRadius: 10,
    backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    minHeight: 44,
  },
  secondaryBtnText: { color: COLORS.cream, fontSize: 13, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.darkBg,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.xl,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  modalTitle: { fontSize: 18, color: COLORS.cream, fontWeight: '600', marginBottom: 4 },
  modalSub: { fontSize: 12, color: COLORS.muted, lineHeight: 17, marginBottom: SPACING.md },
  input: {
    backgroundColor: COLORS.cardBg, borderRadius: 8,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    color: COLORS.cream, fontSize: 14,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  cancelBtn: { paddingVertical: SPACING.md, alignItems: 'center', marginTop: SPACING.sm },
  cancelBtnText: { color: COLORS.muted, fontSize: 13 },
});
