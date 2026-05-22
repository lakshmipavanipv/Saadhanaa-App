# Alarm Sounds

The 4 `.mp3` files in this folder are **placeholder silent files** (~24 bytes each).
They make the app build but produce no audible alarm.

To enable real alarm sounds, replace each file with a short royalty-free clip
(5–15 seconds is ideal):

| File | Sound | Where to find |
|---|---|---|
| `flute.mp3` | Indian bansuri / meditative flute | Pixabay Audio, Freesound (CC0) |
| `bell.mp3` | Single brass temple bell strike | Pixabay Audio, Freesound |
| `tanpura.mp3` | Soft tanpura drone in C | Freesound |
| `om.mp3` | Vedic OM chant | Freesound, Pixabay |

After replacing files, rebuild the APK:
```
cd sadhana-rn
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease
```

The app also supports any file the user picks from their device via the
"Choose from device" option in the alarm sound picker, so users can supply
their own audio without needing to update these placeholders.
