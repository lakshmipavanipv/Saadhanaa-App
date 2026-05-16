import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Deity, HistoryEntry, JapaSession, UserProfile } from './types';
import { DEFAULT_DEITIES, SAMPLE_HISTORY } from './constants';
import { Storage } from './storage';

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
  deityProgress: Record<string, { count: number; malas: number }>;
  updateProgress: (deityId: string, count: number, malas: number) => void;
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
  const [deityProgress, setDeityProgress] = useState<Record<string, { count: number; malas: number }>>({});
  const toastRef = useRef<NodeJS.Timeout | null>(null);

  // Load data from storage
  useEffect(() => {
    const loadData = async () => {
      try {
        const loadedProfile = await Storage.get<UserProfile | null>('userProfile', null);
        setUserProfile(loadedProfile);

        // Only seed default data on first run (when not yet onboarded).
        const loadedDeities = await Storage.get<Deity[]>(
          'deities',
          loadedProfile?.onboarded ? [] : DEFAULT_DEITIES
        );
        const loadedHistory = await Storage.get<HistoryEntry[]>(
          'history',
          loadedProfile?.onboarded ? [] : []
        );
        const loadedProgress = await Storage.get<Record<string, { count: number; malas: number }>>('deityProgress', {});
        setDeities(loadedDeities);
        setHistory(loadedHistory);
        setDeityProgress(loadedProgress);
        if (loadedDeities.length > 0) {
          setSelectedDeity(loadedDeities[0]);
        }
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Persist user profile
  useEffect(() => {
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
      const next = { ...p, [deityId]: { count, malas } };
      Storage.set('deityProgress', next);
      return next;
    });
  };

  // Persist deities
  useEffect(() => {
    Storage.set('deities', deities);
  }, [deities]);

  // Persist history
  useEffect(() => {
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
    resetAll,
    deityProgress,
    updateProgress,
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
