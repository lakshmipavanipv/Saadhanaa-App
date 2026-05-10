# Sadhana App - React Native Expo Conversion

This is the React Native Expo version of the Sadhana spiritual companion app.

## Features

✨ **Japa Counter** - 108-bead counter with deity selection and BLE finger counter support
🙏 **Deity Manager** - Manage deities, mantras, and prayer alarm times
📅 **Festival Calendar** - Multi-faith festival calendar with shopping checklists
📊 **History & Stats** - Track sadhana progress with weekly charts and deity statistics
🔔 **Prayer Alarms** - Daily notifications for prayer times

## Project Structure

```
sadhana-rn/
├── src/
│   ├── App.tsx              # Main app with bottom-tab navigation
│   ├── context.tsx          # Global state management (Sadhana context)
│   ├── storage.ts           # AsyncStorage wrapper
│   ├── types.ts             # TypeScript interfaces
│   ├── constants.ts         # Festival DB, default deities, icons
│   ├── utils.ts             # Date & festival utilities
│   ├── theme.ts             # Colors and design tokens
│   └── screens/
│       ├── DashboardScreen.tsx
│       ├── JapaScreen.tsx
│       ├── DeityScreen.tsx
│       ├── FestivalScreen.tsx
│       └── HistoryScreen.tsx
├── app.json                 # Expo config
├── index.js                 # Entry point
├── tsconfig.json            # TypeScript config
└── package.json
```

## Key Changes from PWA

### Storage
- **PWA**: `localStorage` 
- **RN**: `@react-native-async-storage/async-storage`

### State Management
- **PWA**: React hooks + localStorage
- **RN**: React Context + AsyncStorage

### Navigation
- **PWA**: Conditional rendering of screens
- **RN**: React Navigation with bottom-tab navigator

### BLE Support
- **PWA**: Web Bluetooth API (navigator.bluetooth)
- **RN**: `react-native-ble-plx` (requires native configuration - see below)

### Notifications
- **PWA**: Notification API
- **RN**: `expo-notifications` (requires permission setup)

### Styling
- **PWA**: CSS in App.css
- **RN**: React Native StyleSheet

## Setup & Build

### Prerequisites
- Node.js 16+
- Expo CLI: `npm install -g expo-cli`
- Android Studio (for APK builds)
- EAS CLI for production builds: `npm install -g eas-cli`

### Installation

```bash
cd sadhana-rn
npm install
```

### Development

```bash
# Run with Expo Go (easiest for testing)
npm start

# Build for web
npm run web

# Build for Android (local)
eas build --platform android --local

# Run on physical device/emulator
npm run android
```

### Building APK for Play Store

#### Option 1: Using EAS (Recommended)

```bash
# Create EAS account
eas build --platform android

# This will:
# - Build in the cloud
# - Provide signed APK
# - Handle Play Store signing
```

#### Option 2: Local Build

```bash
# Generate signing key
keytool -genkeypair -v -keystore sadhana-release.keystore -keyalg RSA -keysize 2048 -validity 10000 -alias sadhana

# Build APK
eas build --platform android --local
```

## Remaining Integrations

### 1. BLE Support (Finger Counter)
Currently the BLE connection UI is in JapaScreen but not fully implemented. To complete:

```bash
npm install react-native-ble-plx
eas build --platform android --local
```

Then implement in `src/screens/JapaScreen.tsx`:
- Import BLE manager
- Request Bluetooth permissions
- Handle device discovery and connection
- Process key events from device

### 2. Notifications
Prayer alarms currently show in-app toast. To enable system notifications:

```bash
npx expo-doctor
npx expo config plugins
```

Then update `src/context.tsx` `requestNotif()` function to use `expo-notifications`.

### 3. Android Permissions
Add to `app.json`:

```json
"android": {
  "permissions": [
    "android.permission.BLUETOOTH",
    "android.permission.BLUETOOTH_ADMIN",
    "android.permission.BLUETOOTH_SCAN",
    "android.permission.BLUETOOTH_CONNECT",
    "POST_NOTIFICATIONS"
  ]
}
```

## Testing Checklist

- [ ] Dashboard loads with deities and history
- [ ] Japa counter increments and saves sessions
- [ ] Deity manager add/remove/edit works
- [ ] Festival calendar displays correctly
- [ ] Checklists persist across app restarts
- [ ] History chart renders weekly data
- [ ] Prayer alarms trigger at scheduled times
- [ ] App works on physical Android device

## Color Palette (Dark Theme)

```
Deep background:   #0a0e27
Dark card bg:      #1a1f3a
Gold accent:       #d4a017
Cream text:        #f5e6d3
Saffron:           #ff8c42
Leaf green:        #4ade80
```

## Performance Notes

- Festival checklist state uses AsyncStorage for persistence
- History data is loaded on app start and kept in memory
- Context provides global state without Redux complexity
- Bottom-tab navigation prevents unnecessary re-renders

## Next Steps

1. ✅ Scaffold Expo project
2. ✅ Convert screens to React Native
3. ✅ Set up AsyncStorage & Context
4. ⏳ Complete BLE implementation
5. ⏳ Add notification integration
6. ⏳ Test on Android device
7. ⏳ Configure Play Store signing
8. ⏳ Build and publish APK
