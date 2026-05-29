import React, { useState, useEffect } from 'react';
import { getDB } from './soulsync/db/database';
import { ambientIngestion } from './soulsync/services/AmbientIngestion';
import { useEmotionalState } from './soulsync/hooks/useEmotionalState';
import { GroundingOverlay } from './soulsync/components/GroundingOverlay';
import { CoolingOverlay } from './soulsync/components/CoolingOverlay';
import { StyleSheet, View, Text, StatusBar, TouchableOpacity, Modal } from 'react-native';
import { SplashScreen } from './components/SplashScreen';
import { initNotifications } from './services/notifications';
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
import { JapaScreen } from './screens/JapaScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { MeditationScreen } from './screens/MeditationScreen';
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
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.darkBg,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          height: 60 + insets.bottom,
        },
        tabBarActiveTintColor: COLORS.gold,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarLabelStyle: {
          fontSize: 10,
          marginTop: 2,
        },
        sceneStyle: {
          backgroundColor: COLORS.deep,
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
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text>,
        }}
      />
      <Tab.Screen
        name="Plan"
        component={SankalpaScreen}
        options={{
          // Hidden from the bottom tab bar — accessible only via the
          // "Plan your routine" CTA on the Home tab. Keeps the bar lean.
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
        }}
      />
      <Tab.Screen
        name="Exercise"
        component={ExerciseScreen}
        options={{
          tabBarLabel: 'Exercise',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏃</Text>,
        }}
      />
      <Tab.Screen
        name="Yoga"
        component={YogaMeditationWrapper}
        options={{
          tabBarLabel: 'Yoga & Meditate',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🧘‍♀️</Text>,
        }}
      />
      <Tab.Screen
        name="Japa"
        component={JapaScreen}
        options={{
          tabBarLabel: 'Japa',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📿</Text>,
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
      <Tab.Screen
        name="Panchang"
        component={FestivalScreen}
        options={{
          tabBarLabel: 'Panchang',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🛕</Text>,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'My Reports',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📊</Text>,
        }}
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
  const { isLoading, toast, userProfile, deities, setSelectedDeity } = useSadhana();
  const [showSettings, setShowSettings] = useState(false);
  // Listen for emotional events — routes to the right overlay
  const { activeEvent, dismiss } = useEmotionalState();

  // ── Prayer reminder popup state ──────────────────────────────
  const [prayerDeity, setPrayerDeity] = useState<Deity | null>(null);

  // Subscribe to incoming notifications. When a prayer-reminder
  // notification fires (foreground or user tap), show the big popup.
  React.useEffect(() => {
    const handle = (resp: Notifications.NotificationResponse | Notifications.Notification) => {
      const data = (resp as any).notification?.request?.content?.data
                 ?? (resp as any).request?.content?.data
                 ?? {};
      if (data?.type === 'prayer-reminder' && data?.deityId) {
        const d = deities.find(x => x.id === data.deityId);
        if (d) setPrayerDeity(d);
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

  if (isLoading) {
    return <SplashScreen label="Awakening your sadhana" />;
  }

  if (!userProfile?.onboarded) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.deep} translucent />
        <OnboardingScreen />
        {toast && <Toast message={toast} />}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.deep} translucent />
      <NavigationContainer ref={navRef}>
        <TabNavigator />
      </NavigationContainer>
      <SettingsButton onPress={() => setShowSettings(true)} />
      {/* Voice assistant — multilingual, elder-friendly */}
      <VoiceAssistant navRef={navRef} />
      <Modal visible={showSettings} animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <SettingsScreen onClose={() => setShowSettings(false)} />
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

export default function App() {
  // ── Soulsync bootstrap — open DB, start ambient ingestion ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getDB();               // runs migrations on first launch
        if (!cancelled) await ambientIngestion.start();
        await initNotifications();   // register Android channel for prayer reminders
      } catch (e) {
        // Failures here must NEVER block the rest of the app
        console.warn('[Soulsync] bootstrap failed:', e);
      }
    })();
    return () => { cancelled = true; ambientIngestion.stop(); };
  }, []);

  return (
    <SafeAreaProvider>
      <SadhanaProvider>
        <AppContent />
      </SadhanaProvider>
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
});
