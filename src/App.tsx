import React from 'react';
import { StyleSheet, View, ActivityIndicator, Text, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { SadhanaProvider, useSadhana } from './context';
import { DashboardScreen } from './screens/DashboardScreen';
import { JapaScreen } from './screens/JapaScreen';
import { SandhyaScreen } from './screens/SandhyaScreen';
import { DeityScreen } from './screens/DeityScreen';
import { FestivalScreen } from './screens/FestivalScreen';
import { HistoryScreen } from './screens/HistoryScreen';
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
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🕉️</Text>,
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
      <Tab.Screen
        name="Sandhya"
        component={SandhyaScreen}
        options={{
          tabBarLabel: 'Sandhya',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🪷</Text>,
        }}
      />
      <Tab.Screen
        name="Deities"
        component={DeityScreen}
        options={{
          tabBarLabel: 'Deities',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🌸</Text>,
        }}
      />
      <Tab.Screen
        name="Festivals"
        component={FestivalScreen}
        options={{
          tabBarLabel: 'Festivals',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🪔</Text>,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'History',
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
  const { isLoading, toast } = useSadhana();

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.deep} translucent />
      <NavigationContainer>
        <TabNavigator />
      </NavigationContainer>
      {toast && <Toast message={toast} />}
    </View>
  );
};

export default function App() {
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
});
