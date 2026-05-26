# Firebase Setup (one-time, ~10 minutes)

The app uses **Firebase Auth** for Google sign-in and anonymous sign-in.
The build ships with a placeholder `google-services.json` so it compiles —
replace it with your real one before shipping for real users.

## Steps

### 1. Create a Firebase project
- Open https://console.firebase.google.com
- Click **Add project** → name it **Sadhana** → Continue → (disable Google Analytics if you don't need it) → Create
- Wait ~30 seconds for provisioning

### 2. Add an Android app
- In the project, click the **Android icon** under "Get started by adding your first app"
- **Android package name:** `com.sadhana.app`
- **App nickname:** Sadhana
- **Debug signing SHA-1:** see step 3 below
- Click **Register app**

### 3. Get the SHA-1 fingerprint (from EAS)
- In another terminal:
  ```bash
  cd "C:\Projects\Sadhana App\sadhana-rn"
  eas credentials
  ```
- Pick **Android** → **production** profile (or `preview`)
- Choose **"Keystore"** → it'll print the **SHA-1** fingerprint
  - Looks like `AB:CD:EF:01:23:45:67:89:...`
- Paste it into the Firebase Android setup form

### 4. Download google-services.json
- Click **Download google-services.json**
- **Replace** the placeholder file at `sadhana-rn/google-services.json` with your downloaded file
- The file is in `.gitignore` by default (uncomment to enable) — **do not commit your real one to public repos**

### 5. Enable sign-in methods
- In Firebase Console → **Authentication** → **Sign-in method** tab
- Enable **Google** (just toggle on, no extra config needed)
- Enable **Anonymous** (used for "Skip for now" flow)

### 6. Rebuild the APK
```bash
eas build --platform android --profile preview --non-interactive
```

Done. The app will now:
- Show the **native Google account picker** when user taps "Continue with Google"
- Silently sign in **anonymously** when user taps "Skip for now"
- Preserve the Firebase UID even if user upgrades from anonymous → Google later

## Optional: iOS later

When you build for iOS:
1. Add iOS app in Firebase Console (bundle id: `com.sadhana.app`)
2. Download `GoogleService-Info.plist`
3. Place at `sadhana-rn/GoogleService-Info.plist`
4. Add `"googleServicesFile": "./GoogleService-Info.plist"` under `ios` in `app.json`
5. Enable **Apple** as a sign-in provider in Firebase Console (required by App Store)

## Troubleshooting

| Symptom | Fix |
|---|---|
| Google button shows "unavailable" on Android APK | google-services.json is placeholder or SHA-1 mismatch — re-download from Firebase Console |
| `DEVELOPER_ERROR` when tapping Google sign-in | SHA-1 fingerprint mismatch. Re-run `eas credentials`, add SHA-1 to Firebase Android app settings |
| Web preview button greyed out | Expected — Firebase native SDK doesn't run on web. Manual entry works. |
