import React, { useState, useEffect } from 'react';
import { getDB } from './soulsync/db/database';
import { ambientIngestion } from './soulsync/services/AmbientIngestion';
import { useEmotionalState } from './soulsync/hooks/useEmotionalState';
import { GroundingOverlay } from './soulsync/components/GroundingOverlay';
import { CoolingOverlay } from './soulsync/components/CoolingOverlay';
import { StyleSheet, View, Text, StatusBar, TouchableOpacity, Modal } from 'react-native';
import { SplashScreen } from './components/SplashScreen';
import { initNotifications } from './services/notifications';
import { startStepTracking } from './services/stepTracker';
import { ConsentScreen } from './screens/ConsentScreen';
import { consentRepo } from './services/consentRepo';
import { telemetry } from './services/telemetry';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { SadhanaProvider, useSadhana } from './context';
import { DashboardScreen } from './screens/DashboardScreen';
// JapaSandhyaWrapper removed — Sandhya now lives entirely under Plan tab
import { FestivalScreen } from './screens/FestivalScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ExerciseScreen } from './screens/ExerciseScreen';
import { SankalpaScreen } from './screens/SankalpaScreen';
import { WellBeingPlanScreen } from './screens/WellBeingPlanScreen';
import { JapaScreen } from './screens/JapaScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { MeditationScreen } from './screens/MeditationScreen';
import { HealthScreen } from './screens/HealthScreen';
import { HealthHubScreen } from './screens/health/HealthHubScreen';
import { MetricDetailScreen } from './screens/health/MetricDetailScreen';
import { StressDetailScreen } from './screens/health/StressDetailScreen';
import { SleepDetailScreen } from './screens/health/SleepDetailScreen';
import { ExerciseDetailScreen } from './screens/health/ExerciseDetailScreen';
import { DeviceSettingsScreen } from './screens/DeviceSettingsScreen';
import { RingDebugScreen } from './screens/RingDebugScreen';
import { RemindersScreen } from './screens/RemindersScreen';
import { SideDrawer, type DrawerAction } from './components/SideDrawer';
import { ThemePicker } from './components/ThemePicker';
import { ThemeProvider, useTheme } from './ThemeContext';
import { YogaMeditationWrapper } from './screens/YogaMeditationWrapper';
import { AnxietyReliefPopup } from './soulsync/components/AnxietyReliefPopup';
import { AggressionReliefPopup } from './soulsync/components/AggressionReliefPopup';
import { DailyRecommendationsPopup } from './soulsync/components/DailyRecommendationsPopup';
import { PrayerReminderPopup } from './soulsync/components/PrayerReminderPopup';
import { VoiceAssistant } from './components/VoiceAssistant';
import * as Notifications from 'expo-notifications';
import { Deity } from './types';
import { COLORS } from './theme';

const Tab = createBottomTabNavigator();

const TabNavigator = () => {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: palette.darkBg,
          borderTopColor: palette.border,
          borderTopWidth: 1,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 10),
          // Bigger bar so 5 evenly-distributed tabs fill it comfortably.
          height: 78 + insets.bottom,
        },
        tabBarActiveTintColor: palette.gold,
        tabBarInactiveTintColor: palette.muted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
        tabBarIconStyle: {
          marginBottom: 2,
        },
        tabBarItemStyle: {
          // Each tab takes an equal slice so they fill the whole bar.
          flex: 1,
          paddingTop: 4,
        },
        sceneStyle: {
          backgroundColor: palette.deep,
          paddingTop: insets.top,
        },
      }}
    >
      {/* Tab order follows the Panchakosha (5 sheaths) — outer body
          to inner cosmos:  Body → Breath → Mind → Wisdom → Bliss.
            Exercise  = annamaya  (body/food sheath)
            Yoga      = pranamaya (breath/life-force sheath)
            Japa      = manomaya  (mind sheath — Sandhya lives here too)
            Meditate  = vijnanamaya (wisdom sheath)
            Festivals = anandamaya (bliss/cosmic sheath) */}
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 26, color }}>🏠</Text>,
        }}
      />
      {/* Plan moved to hidden route — accessed via ☰ drawer → Plan Your
          Wellbeing, and via the big 🎯 tile on the Exercise tab. Keeping it
          mounted so navigation.navigate('Plan') calls still resolve. */}
      <Tab.Screen
        name="Plan"
        component={WellBeingPlanScreen}
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' }, tabBarStyle: { display: 'none' } }}
      />
      <Tab.Screen
        name="PlanLegacy"
        component={SankalpaScreen}
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
        }}
      />

      {/* Reordered bottom tabs: Home → Japa → Yoga & Meditate → Exercise → Health */}
      <Tab.Screen
        name="Japa"
        component={JapaScreen}
        options={{
          tabBarLabel: 'Japa',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 26, color }}>📿</Text>,
        }}
      />
      <Tab.Screen
        name="Yoga"
        component={YogaMeditationWrapper}
        options={{
          tabBarLabel: 'Yoga & Meditate',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 26, color }}>🧘‍♀️</Text>,
        }}
      />
      <Tab.Screen
        name="Exercise"
        component={ExerciseScreen}
        options={{
          tabBarLabel: 'Exercise',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 26, color }}>🏃</Text>,
        }}
      />
      {/* Meditation kept as a HIDDEN route so the anxiety / aggression relief
          popups can still navigate to it directly with an `openId` param.
          Visually merged into the Yoga tab via YogaMeditationWrapper above. */}
      <Tab.Screen
        name="Meditation"
        component={MeditationScreen}
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
        }}
      />
      {/* Panchang moved to left drawer (accessible via ☰ → Sadhana → Panchang).
          History (My Reports) moved to left drawer as well. Both still exist as
          navigable routes so drawer taps can target them. */}
      <Tab.Screen
        name="Panchang"
        component={FestivalScreen}
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' }, tabBarStyle: { display: 'none' } }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' }, tabBarStyle: { display: 'none' } }}
      />
      <Tab.Screen
        name="Health"
        component={HealthHubScreen}
        options={{
          tabBarLabel: 'Health',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 26, color }}>💗</Text>,
        }}
      />
      {/* Health-detail routes — reachable via Health hub tile taps. Hidden
          from the tab bar (tabBarItemStyle:display:none) and the tab bar
          itself hides while the detail is open. */}
      <Tab.Screen
        name="MetricDetail"
        component={MetricDetailScreen}
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' }, tabBarStyle: { display: 'none' } }}
      />
      <Tab.Screen
        name="StressDetail"
        component={StressDetailScreen}
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' }, tabBarStyle: { display: 'none' } }}
      />
      <Tab.Screen
        name="SleepDetail"
        component={SleepDetailScreen}
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' }, tabBarStyle: { display: 'none' } }}
      />
      <Tab.Screen
        name="ExerciseDetail"
        component={ExerciseDetailScreen}
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' }, tabBarStyle: { display: 'none' } }}
      />
      {/* Retained legacy full Health tab, kept mounted for deep-links but hidden. */}
      <Tab.Screen
        name="HealthLegacy"
        component={HealthScreen}
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' }, tabBarStyle: { display: 'none' } }}
      />
      {/* Reminders — hidden tab reachable from drawer + Device Settings. */}
      <Tab.Screen
        name="Reminders"
        component={RemindersScreen}
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' }, tabBarStyle: { display: 'none' } }}
      />
    </Tab.Navigator>
  );
};

const Toast = ({ message }: { message: string }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.toast, { bottom: 80 + insets.bottom }]}>
      <Text style={{ color: COLORS.cream, fontSize: 14 }}>🙏 {message}</Text>
    </View>
  );
};

const AppContent = () => {
  const {
    isLoading, toast, userProfile, deities, setSelectedDeity,
    pendingRoute, setPendingRoute,
  } = useSadhana();
  const { palette } = useTheme();
  const [showSettings, setShowSettings] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [showRingDebug, setShowRingDebug] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  // v75: DPDP consent gate — null = still loading, true = must show consent.
  const [needsConsent, setNeedsConsent] = useState<boolean | null>(null);
  // Listen for emotional events — routes to the right overlay
  const { activeEvent, dismiss } = useEmotionalState();

  // Load consent state on mount; once granted, sync it + profile to the server.
  React.useEffect(() => {
    consentRepo.needsConsent().then(setNeedsConsent);
  }, []);
  React.useEffect(() => {
    if (needsConsent === false) {
      telemetry.syncConsent();
      telemetry.profile({ name: userProfile?.name || undefined });
    }
  }, [needsConsent, userProfile?.name]);

  // ── Prayer reminder popup state ──────────────────────────────
  const [prayerDeity, setPrayerDeity] = useState<Deity | null>(null);

  // Track active tab so we can hide UI chrome (settings cog) while on
  // the Plan tab — the Plan screen wants a cleaner, less cluttered top.
  const [activeRoute, setActiveRoute] = useState<string>('Dashboard');

  // Subscribe to incoming notifications. When a prayer-reminder
  // notification fires (foreground or user tap), show the big popup.
  // v60: also speak the notification title+body via expo-speech when
  // a plan-reminder fires AND the user enabled "Spoken reminder" on it.
  React.useEffect(() => {
    const handle = async (resp: Notifications.NotificationResponse | Notifications.Notification) => {
      const content = (resp as any).notification?.request?.content
                   ?? (resp as any).request?.content
                   ?? {};
      const data = content.data ?? {};

      // Existing deity-prayer flow
      if (data?.type === 'prayer-reminder' && data?.deityId) {
        const d = deities.find(x => x.id === data.deityId);
        if (d) setPrayerDeity(d);
      }

      // v60: plan-reminder voice announcement.  If the routine item was
      // saved with spokenReminder: true, the schedule call set a
      // personalised title/body ("🪷 Hey Lakshmi" + "Your walk is at
      // 06:30 — 20 min").  Read that out via the system TTS engine.
      if (data?.type === 'plan-reminder') {
        try {
          const text = `${content.title || ''}. ${content.body || ''}`.replace(/[🪷🎯]/g, '').trim();
          if (text) {
            const ExpoSpeech = await import('expo-speech');
            ExpoSpeech.stop();
            ExpoSpeech.speak(text, { language: 'en-IN', rate: 0.92, pitch: 1.0 });
          }
        } catch (e) {
          console.warn('[App] plan-reminder speak failed', e);
        }
      }
    };
    const fgSub = Notifications.addNotificationReceivedListener(n => handle(n as any));
    const tapSub = Notifications.addNotificationResponseReceivedListener(r => handle(r));
    return () => { fgSub.remove(); tapSub.remove(); };
  }, [deities]);
  // Anxiety relief flow: show the choose-a-technique popup FIRST. If the
  // user picks one, navigate to Meditation tab; if they pick "I'm fine",
  // dismiss the event. If they ignore it, fall back to the locked
  // GroundingOverlay after 15 seconds.
  const [showAnxietyPopup, setShowAnxietyPopup] = useState(false);
  const [forceOverlay, setForceOverlay] = useState(false);
  const navRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (activeEvent?.trigger === 'anxiety') {
      setShowAnxietyPopup(true);
      setForceOverlay(false);
      // If user ignores the popup for 15 sec, fall back to the locked
      // GroundingOverlay (more intrusive, gets their attention)
      const t = setTimeout(() => setForceOverlay(true), 15_000);
      return () => clearTimeout(t);
    }
    setShowAnxietyPopup(false);
    setForceOverlay(false);
  }, [activeEvent?.id, activeEvent?.trigger]);

  // ── Pending-route consumer ──────────────────────────────────────
  // Onboarding sets `pendingRoute = 'Plan'` when the user picks "Plan
  // your well-being now". When userProfile flips to onboarded the
  // TabNavigator mounts and the navRef becomes valid on next tick — we
  // fire the navigation then and clear the intent so it doesn't replay.
  React.useEffect(() => {
    if (!pendingRoute || !userProfile?.onboarded) return;
    // Wait one tick so the navigator + ref are fully attached.
    const t = setTimeout(() => {
      try { navRef.current?.navigate?.(pendingRoute); } catch { /* noop */ }
      setPendingRoute(null);
    }, 150);
    return () => clearTimeout(t);
  }, [pendingRoute, userProfile?.onboarded, setPendingRoute]);

  if (isLoading || needsConsent === null) {
    return <SplashScreen label="Awakening your body & soul" />;
  }

  // v75: DPDP consent gate — shown before anything else collects data.
  if (needsConsent) {
    return (
      <View style={[styles.container, { backgroundColor: palette.deep }]}>
        <StatusBar barStyle={palette.deep === '#f5f5f7' ? 'dark-content' : 'light-content'} backgroundColor={palette.deep} translucent />
        <ConsentScreen onAgree={() => setNeedsConsent(false)} />
        {toast && <Toast message={toast} />}
      </View>
    );
  }

  if (!userProfile?.onboarded) {
    return (
      <View style={[styles.container, { backgroundColor: palette.deep }]}>
        <StatusBar barStyle={palette.deep === '#f5f5f7' ? 'dark-content' : 'light-content'} backgroundColor={palette.deep} translucent />
        <OnboardingScreen />
        {toast && <Toast message={toast} />}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.deep} translucent />
      <NavigationContainer
        ref={navRef}
        onStateChange={(state) => {
          // Read the focused route name from the tab navigator so we can
          // conditionally hide the settings cog when the user is on Plan.
          const route = state?.routes?.[state.index ?? 0]?.name;
          if (route) setActiveRoute(route);
        }}
      >
        <TabNavigator />
      </NavigationContainer>
      {/* Settings gear removed — Profile & app settings now live under the
          hamburger drawer (☰ → Profile & Personal Info). */}
      {activeRoute !== 'Plan' && <HamburgerButton onPress={() => setShowDrawer(true)} />}
      {/* Voice assistant floating mic disabled — it overlapped the Health tab.
          Re-enable via drawer if we need it back. */}
      {false && <VoiceAssistant navRef={navRef} />}
      <Modal visible={showSettings} animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <SettingsScreen onClose={() => setShowSettings(false)} />
      </Modal>
      <SideDrawer
        visible={showDrawer}
        onClose={() => setShowDrawer(false)}
        onSelect={(action: DrawerAction) => {
          if (action.navigate) {
            navRef.current?.navigate(action.navigate as never);
          } else if (action.openModal === 'settings') {
            setShowSettings(true);
          } else if (action.openModal === 'deviceSettings') {
            setShowDeviceSettings(true);
          } else if (action.openModal === 'ringDebug') {
            setShowRingDebug(true);
          } else if (action.openModal === 'aiInsights') {
            navRef.current?.navigate('History' as never);
          } else if (action.openModal === 'themePicker') {
            setShowThemePicker(true);
          }
        }}
      />
      <ThemePicker visible={showThemePicker} onClose={() => setShowThemePicker(false)} />
      <Modal visible={showDeviceSettings} animationType="slide" onRequestClose={() => setShowDeviceSettings(false)}>
        <DeviceSettingsScreen
          onClose={() => setShowDeviceSettings(false)}
          onOpenPair={() => { setShowDeviceSettings(false); setTimeout(() => setShowRingDebug(true), 100); }}
        />
      </Modal>
      <Modal visible={showRingDebug} animationType="slide" onRequestClose={() => setShowRingDebug(false)}>
        <RingDebugScreen onClose={() => setShowRingDebug(false)} />
      </Modal>
      {toast && <Toast message={toast} />}

      {/* ── Daily body↔soul recommendations popup (once per day) ── */}
      <DailyRecommendationsPopup
        onNavigate={(tab, params) => navRef.current?.navigate?.(tab, params)}
      />

      {/* ── Anxiety flow:
            1. Ring buzzes (in AnxietyDetector.fire)
            2. AnxietyReliefPopup appears — user picks technique OR dismisses
            3. If chosen → nav to Meditation tab with technique pre-opened
            4. If ignored 15s → fall back to GroundingOverlay (locked) ── */}
      {activeEvent?.trigger === 'anxiety' && !forceOverlay && (
        <AnxietyReliefPopup
          event={activeEvent}
          visible={showAnxietyPopup}
          onChooseTechnique={(techniqueId) => {
            setShowAnxietyPopup(false);
            // Navigate to Meditation tab + pass the technique id as a param
            navRef.current?.navigate?.('Meditation', { openId: techniqueId });
            dismiss();
          }}
          onDismiss={() => { setShowAnxietyPopup(false); dismiss(); }}
        />
      )}
      {activeEvent?.trigger === 'anxiety' && forceOverlay && (
        <GroundingOverlay event={activeEvent} onDismiss={dismiss} />
      )}
      {/* ── Aggression flow: ring already buzzes in detector.
            Show technique chooser popup first. The user can pick a cooling
            practice (navigates to Meditation tab) or dismiss. ── */}
      {activeEvent?.trigger === 'aggression' && (
        <AggressionReliefPopup
          event={activeEvent}
          visible={true}
          onChooseTechnique={(techniqueId) => {
            navRef.current?.navigate?.('Meditation', { openId: techniqueId });
            dismiss();
          }}
          onDismiss={dismiss}
        />
      )}

      {/* ── Prayer-reminder popup: big "Do Japa Now" modal triggered by
            an incoming deity reminder notification. ── */}
      <PrayerReminderPopup
        deity={prayerDeity}
        visible={!!prayerDeity}
        onStartJapa={() => {
          if (prayerDeity) {
            setSelectedDeity(prayerDeity);
            navRef.current?.navigate?.('Japa');
          }
          setPrayerDeity(null);
        }}
        onSnooze={() => {
          // Reschedule the same reminder for 5 min later
          if (prayerDeity) {
            const fiveMin = new Date(Date.now() + 5 * 60_000);
            Notifications.scheduleNotificationAsync({
              content: {
                title: `🪷 ${prayerDeity.name} — prayer time (snoozed)`,
                body: prayerDeity.mantra ? `"${prayerDeity.mantra}"` : 'Time for your sadhana',
                sound: 'default',
                data: { deityId: prayerDeity.id, type: 'prayer-reminder' },
              },
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: fiveMin,
                channelId: 'prayer-reminders',
              } as any,
            }).catch(() => {});
          }
          setPrayerDeity(null);
        }}
        onDismiss={() => setPrayerDeity(null)}
      />

      {/* Lethargy (Micro-Sādhanā) renders inline on the Home tab — no overlay */}
    </View>
  );
};

const SettingsButton = ({ onPress }: { onPress: () => void }) => {
  const insets = useSafeAreaInsets();
  return (
    <TouchableOpacity
      style={[styles.cogBtn, { top: 12 + insets.top }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.cogText}>⚙</Text>
    </TouchableOpacity>
  );
};

const HamburgerButton = ({ onPress }: { onPress: () => void }) => {
  const insets = useSafeAreaInsets();
  return (
    <TouchableOpacity
      style={[styles.burgerBtn, { top: 8 + insets.top }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.burgerText}>☰</Text>
    </TouchableOpacity>
  );
};

export default function App() {
  // ── Soulsync bootstrap — open DB, start ambient ingestion ──
  useEffect(() => {
    let cancelled = false;
    let stopSteps: (() => void) | null = null;
    (async () => {
      try {
        await getDB();               // runs migrations on first launch
        if (!cancelled) await ambientIngestion.start();
        await initNotifications();   // register Android channel for prayer reminders
        // v73: start the foreground pedometer — accumulates today's steps and
        // fires a "goal achieved" notification when a planned walk goal is met.
        if (!cancelled) stopSteps = await startStepTracking();
      } catch (e) {
        // Failures here must NEVER block the rest of the app
        console.warn('[Soulsync] bootstrap failed:', e);
      }
    })();
    return () => { cancelled = true; ambientIngestion.stop(); stopSteps?.(); };
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SadhanaProvider>
          <AppContent />
        </SadhanaProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.deep,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    zIndex: 9999,
  },
  cogBtn: {
    position: 'absolute',
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  cogText: { fontSize: 18, color: COLORS.gold },
  burgerBtn: {
    position: 'absolute',
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  burgerText: { fontSize: 20, color: COLORS.gold },
});
