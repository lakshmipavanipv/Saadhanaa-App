import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Deity, HistoryEntry, JapaSession, UserProfile } from './types';
import { DEFAULT_DEITIES, SAMPLE_HISTORY } from './constants';
import { Storage } from './storage';
import { ALL_CATALOG_DEITIES } from './deityCatalog';
import { todayStr } from './utils';
import { dayRollover } from './services/dayRollover';

/**
 * A deity's in-progress bead count, and the day it belongs to.
 *
 * `day` is the fix for a count that outlived its day. This used to be just
 * `{count, malas}` with no date on it, persisted to storage and restored
 * verbatim — so 40 beads into a mala at 11:58pm were still 40 beads at 12:01am
 * on a fresh day, and the day's mala total carried over with them. Neither
 * number was wrong when it was written; nothing ever told them the day had
 * ended.
 *
 * Optional because entries written before this existed have no day, and an
 * undated entry is treated as stale rather than as today's.
 */
export interface DeityProgress {
  count: number;
  malas: number;
  /** Local YYYY-MM-DD this progress was recorded on. */
  day?: string;
}

/**
 * Today's progress only — anything older starts the day at zero.
 *
 * An entry with NO day is adopted as today's rather than discarded. Every
 * entry written before this field existed is in that state, so dropping them
 * would mean the first launch after this ships silently clears whatever mala
 * was in progress — and a partial mala lives nowhere else, since only
 * completed ones are written to `history`. One stale count carried into one
 * day is a far smaller wrong than deleting everyone's unfinished mala once.
 */
const freshProgress = (
  p: Record<string, DeityProgress>,
  today: string = todayStr(),
): Record<string, DeityProgress> => {
  const out: Record<string, DeityProgress> = {};
  for (const [id, v] of Object.entries(p)) {
    if (!v) continue;
    if (v.day === today) out[id] = v;
    else if (v.day === undefined) out[id] = { ...v, day: today };
  }
  return out;
};

interface SadhanaContextType {
  deities: Deity[];
  setDeities: (deities: Deity[] | ((prev: Deity[]) => Deity[])) => void;
  history: HistoryEntry[];
  setHistory: (history: HistoryEntry[] | ((prev: HistoryEntry[]) => HistoryEntry[])) => void;
  selectedDeity: Deity | null;
  setSelectedDeity: (deity: Deity | null) => void;
  alarmQueue: Deity[];
  dismissAlarm: () => void;
  notifGranted: boolean;
  requestNotif: () => Promise<void>;
  showToast: (message: string) => void;
  toast: string | null;
  saveSession: (session: JapaSession) => void;
  isLoading: boolean;
  userProfile: UserProfile | null;
  setUserProfile: (p: UserProfile | null) => void;
  resetAll: () => Promise<void>;
  deityProgress: Record<string, DeityProgress>;
  updateProgress: (deityId: string, count: number, malas: number) => void;

  /** One-shot navigation intent set by Onboarding when the user picks
   *  "Plan your well-being now". App.tsx reads it after the TabNavigator
   *  mounts and navigates to that tab, then clears it. */
  pendingRoute: string | null;
  setPendingRoute: (r: string | null) => void;

  // ── BLE Ring (shared so Settings can pair without owning the modal) ──
  bleConnected: boolean;
  setBleConnected: (v: boolean) => void;
  /** JapaScreen registers its actual pair / disconnect implementations here
   *  on mount so SettingsScreen can invoke them. Noop until registered. */
  registerBleHandlers: (h: { pair: () => void; disconnect: () => void }) => void;
  requestBlePair: () => void;
  disconnectBleRing: () => void;
}

const SadhanaContext = createContext<SadhanaContextType | undefined>(undefined);

export const SadhanaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deities, setDeities] = useState<Deity[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedDeity, setSelectedDeity] = useState<Deity | null>(null);
  const [alarmQueue, setAlarmQueue] = useState<Deity[]>([]);
  const [notifGranted, setNotifGranted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [deityProgress, setDeityProgress] = useState<Record<string, DeityProgress>>({});
  const toastRef = useRef<NodeJS.Timeout | null>(null);
  // Prevents the empty-initial-state useEffect from wiping saved storage
  // before the load-on-mount completes.
  const hasLoaded = useRef(false);

  // Load data from storage
  useEffect(() => {
    const loadData = async () => {
      try {
        const loadedProfile = await Storage.get<UserProfile | null>('userProfile', null);
        setUserProfile(loadedProfile);

        // Fresh installs now start with ZERO deities. The user picks from
        // the catalog (or adds custom ones) the first time they tap "Add
        // a Sadhana".  The old DEFAULT_DEITIES seed pre-selected Ganesha
        // / Krishna / Lakshmi and pretended the user already owned them,
        // which confused new sadhakas.  Empty start, user owns every pick.
        const loadedDeities = await Storage.get<Deity[]>('deities', []);
        const loadedHistory = await Storage.get<HistoryEntry[]>(
          'history',
          loadedProfile?.onboarded ? [] : []
        );
        const loadedProgress = await Storage.get<Record<string, DeityProgress>>('deityProgress', {});

        // ── Migration: backfill mala material/color from catalog for existing deities ──
        const migratedDeities = loadedDeities.map(d => {
          if (d.malaColor && d.malaHighlight) return d;
          const cat = ALL_CATALOG_DEITIES.find(c => c.id === d.id);
          if (cat?.malaColor) {
            return {
              ...d,
              malaMaterial: d.malaMaterial || cat.malaMaterial,
              malaColor: d.malaColor || cat.malaColor,
              malaHighlight: d.malaHighlight || cat.malaHighlight,
            };
          }
          return d;
        });
        setDeities(migratedDeities);
        setHistory(loadedHistory);
        // Yesterday's half-finished mala is not today's. A cold start after
        // midnight restored it verbatim before this.
        setDeityProgress(freshProgress(loadedProgress));
        if (migratedDeities.length > 0) {
          setSelectedDeity(migratedDeities[0]);
        }
      } finally {
        // Mark loaded BEFORE clearing isLoading so persistence effects
        // can save subsequent changes but won't run during initial mount.
        hasLoaded.current = true;
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Persist user profile
  useEffect(() => {
    if (!hasLoaded.current) return;
    if (userProfile) Storage.set('userProfile', userProfile);
  }, [userProfile]);

  const resetAll = async () => {
    await Storage.remove('userProfile');
    await Storage.remove('deities');
    await Storage.remove('history');
    await Storage.remove('festChecked');
    await Storage.remove('festReminders');
    await Storage.remove('sandhyaSettings');
    await Storage.remove('deityProgress');
    setUserProfile(null);
    setDeities([]);
    setHistory([]);
    setSelectedDeity(null);
    setDeityProgress({});
  };

  const updateProgress = (deityId: string, count: number, malas: number) => {
    setDeityProgress(p => {
      // Stamped with the day so it can be recognised as stale tomorrow.
      const next = { ...p, [deityId]: { count, malas, day: todayStr() } };
      Storage.set('deityProgress', next);
      return next;
    });
  };

  /**
   * Start the new day at zero.
   *
   * The count is in-progress state, not history — completed malas were already
   * written to `history` and to `japa_day` by `saveSession`, so nothing is lost
   * here. What is cleared is the partial mala and the running total that would
   * otherwise greet the user as though the previous day's practice were still
   * going.
   */
  useEffect(() => {
    return dayRollover.subscribe((today) => {
      setDeityProgress((p) => {
        /*
         * Roll the day over; do not delete the record.
         *
         * This used to write `{}` to storage, which threw away the per-deity
         * `malas` total along with the in-progress `count`. Only `count` is a
         * today thing. Re-stamping with the new day is what makes it read zero
         * tomorrow, and it leaves every figure that was not about today alone —
         * a reset should end a day, not erase one.
         */
        const next: Record<string, DeityProgress> = {};
        for (const [id, v] of Object.entries(p)) {
          if (v) next[id] = { ...v, count: 0, day: today };
        }
        Storage.set('deityProgress', next);
        return next;
      });
    });
  }, []);

  // Persist deities — only after initial load completes
  useEffect(() => {
    if (!hasLoaded.current) return;
    Storage.set('deities', deities);
  }, [deities]);

  // Persist history — only after initial load completes
  useEffect(() => {
    if (!hasLoaded.current) return;
    Storage.set('history', history);
  }, [history]);

  // Keep selectedDeity in sync with deities array
  useEffect(() => {
    if (deities.length === 0) {
      setSelectedDeity(null);
      return;
    }
    if (!selectedDeity) {
      setSelectedDeity(deities[0]);
      return;
    }
    const fresh = deities.find(d => d.id === selectedDeity.id);
    setSelectedDeity(fresh || deities[0]);
  }, [deities]);

  // Prayer alarm check - every minute
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const cur = `${hh}:${mm}`;
      const due = deities.filter(d => d.alarmOn && d.prayerAlarm === cur);
      if (due.length > 0) {
        setAlarmQueue(q => [...q, ...due]);
      }
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, [deities]);

  const showToast = (message: string) => {
    setToast(message);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2800);
  };

  const dismissAlarm = () => {
    setAlarmQueue(q => q.slice(1));
  };

  const requestNotif = async () => {
    // TODO: Implement using expo-notifications
    showToast('Notifications enabled! 🔔');
    setNotifGranted(true);
  };

  const saveSession = (session: JapaSession) => {
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      ...session,
    };
    setHistory(p => [entry, ...p]);
    setDeities(p =>
      p.map(d => (d.id === session.deityId ? { ...d, totalMalas: d.totalMalas + session.malas } : d))
    );
  };

  // ── BLE state (shared so SettingsScreen can pair) ──
  const [bleConnected, setBleConnected] = useState(false);
  const bleHandlersRef = useRef<{ pair: () => void; disconnect: () => void }>({
    pair: () => showToast('Open Japa tab first to enable ring pairing'),
    disconnect: () => {},
  });
  const registerBleHandlers = useCallback(
    (h: { pair: () => void; disconnect: () => void }) => { bleHandlersRef.current = h; },
    []
  );
  const requestBlePair    = useCallback(() => bleHandlersRef.current.pair(),       []);
  const disconnectBleRing = useCallback(() => bleHandlersRef.current.disconnect(), []);

  const value: SadhanaContextType = {
    deities,
    setDeities,
    history,
    setHistory,
    selectedDeity,
    setSelectedDeity,
    alarmQueue,
    dismissAlarm,
    notifGranted,
    requestNotif,
    showToast,
    toast,
    saveSession,
    isLoading,
    userProfile,
    setUserProfile,
    pendingRoute,
    setPendingRoute,
    resetAll,
    deityProgress,
    updateProgress,
    bleConnected,
    setBleConnected,
    registerBleHandlers,
    requestBlePair,
    disconnectBleRing,
  };

  return <SadhanaContext.Provider value={value}>{children}</SadhanaContext.Provider>;
};

export const useSadhana = (): SadhanaContextType => {
  const context = useContext(SadhanaContext);
  if (!context) {
    throw new Error('useSadhana must be used within SadhanaProvider');
  }
  return context;
};
