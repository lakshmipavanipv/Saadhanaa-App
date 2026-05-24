import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { RingSpinner } from '../../components/RingSpinner';
import { COLORS, SPACING } from '../../theme';
import { insightStorage } from '../ai/insightStorage';
import {
  buildInsightSnapshot, generateInsights, generateRetrospectiveInsights, InsightResult,
} from '../ai/InsightGenerator';

interface Props {
  /** Optional user name — sent to the model for a personal touch. */
  userName?: string;
  /** 'today' = the original daily card (Home tab). 'retrospective' = History tab. */
  mode?: 'today' | 'retrospective';
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; result: InsightResult; stale: boolean }
  | { kind: 'refreshing'; previous: InsightResult | null }
  | { kind: 'error'; message: string };

export const AIInsightsCard: React.FC<Props> = ({ userName, mode = 'today' }) => {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const refresh = useCallback(async () => {
    const previous = (await insightStorage.getCachedAny()) ?? null;
    setState({ kind: 'refreshing', previous });

    try {
      const snap = await buildInsightSnapshot(userName);
      const result = mode === 'retrospective'
        ? await generateRetrospectiveInsights(snap)
        : await generateInsights(snap);
      await insightStorage.setCached(result);
      setState({ kind: 'ready', result, stale: false });
    } catch (e: any) {
      const msg = e?.message ?? 'Unknown error';
      let friendly: string;
      if (msg.includes('GEMMA_NO_KEY'))            friendly = 'Setup needed: add EXPO_PUBLIC_OPENROUTER_KEY to .env (free key at openrouter.ai/keys).';
      else if (msg.includes('GEMMA_HTTP_401'))     friendly = 'OpenRouter key rejected — check your .env value.';
      else if (msg.includes('GEMMA_HTTP_402'))     friendly = 'Free-tier credit exhausted. Try again tomorrow.';
      else if (msg.includes('GEMMA_HTTP_429'))     friendly = 'Rate limit reached — try again in a few minutes.';
      else if (msg.includes('GEMMA_HTTP_503'))     friendly = 'Gemma temporarily unavailable. Try refresh.';
      else if (msg.includes('GEMMA_PARSE'))        friendly = 'Model returned malformed JSON. Try refresh.';
      else if (msg.includes('GEMMA_SHAPE'))        friendly = 'Model response missing required fields. Try refresh.';
      else if (msg.includes('GEMMA_EMPTY'))        friendly = 'Model returned an empty response. Try refresh.';
      else if (msg.includes('Network request failed') || msg.toLowerCase().includes('fetch'))
        friendly = 'Network error — check your connection.';
      else                                          friendly = msg;
      setState({ kind: 'error', message: friendly });
    }
  }, [userName, mode]);

  const loadInitial = useCallback(async () => {
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
    // No cache → trigger first generation automatically
    void refresh();
  }, [refresh]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.title}>
            {mode === 'retrospective' ? 'AI Retrospective' : 'AI Insights'}
          </Text>
          <Text style={styles.poweredBy}>· Gemma 2</Text>
        </View>
      </View>

      {state.kind === 'loading' && (
        <View style={styles.center}>
          <RingSpinner size={32} />
          <Text style={styles.refreshHint}>Loading your insights…</Text>
        </View>
      )}

      {(state.kind === 'ready' || state.kind === 'refreshing') && (() => {
        const result = state.kind === 'ready' ? state.result : state.previous;
        const refreshing = state.kind === 'refreshing';
        if (!result) {
          return (
            <View style={styles.center}>
              <RingSpinner size={40} />
              <Text style={styles.refreshHint}>Generating your first insight via Gemma…</Text>
              <Text style={styles.subHint}>(may take 20-30s on first run)</Text>
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
                  ? <RingSpinner size={18} />
                  : <Text style={styles.refreshBtn}>↻ Refresh</Text>}
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      {state.kind === 'error' && (
        <View>
          <Text style={styles.errorTitle}>Couldn't reach Gemma</Text>
          <Text style={styles.errorBody}>{state.message}</Text>
          <View style={styles.errorBtnRow}>
            <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={() => refresh()}>
              <Text style={styles.primaryBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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

  center: { alignItems: 'center', paddingVertical: SPACING.lg },
  refreshHint: { fontSize: 11, color: COLORS.muted, marginTop: SPACING.sm, fontStyle: 'italic' },
  subHint: { fontSize: 10, color: COLORS.muted, marginTop: 4, fontStyle: 'italic', opacity: 0.7 },

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
});
