/**
 * BuildStamp — which bundle is actually running, readable from the phone.
 *
 * WHY THIS EXISTS
 *
 * "Is it installed?" has come up over and over, and there has been no way to
 * answer it from the device. Publishing an update is not installing one:
 * `expo-updates` downloads in the background and swaps the bundle on a COLD
 * start, so a phone can sit a build or two behind while the dashboard says
 * everything shipped. Every check so far has needed a USB/Wi-Fi debug link,
 * and that link keeps dropping.
 *
 * So the app says it itself. The update id and the time it was published come
 * from `expo-updates` at runtime — not a hardcoded version string, which is
 * exactly the thing that goes stale and then lies. The drawer footer said
 * "v1.0.75" for months of builds.
 *
 * READING IT
 *
 *   embedded            running the bundle baked into the APK — no OTA has
 *                       been applied yet
 *   a short id + date   running that published update
 *
 * If the id does not match the newest publish, the phone has not cold-started
 * since it downloaded: swipe the app away and reopen.
 */

import React from 'react';
import { Text, StyleSheet, type TextStyle, type StyleProp } from 'react-native';
import * as Updates from 'expo-updates';
import { COLORS } from '../theme';

/** Enough of the id to tell two publishes apart, short enough to read aloud. */
const shortId = (id: string | null): string =>
  id ? id.replace(/-/g, '').slice(0, 8) : 'embedded';

const when = (d: Date | null): string =>
  d
    ? d.toLocaleString(undefined, {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : 'built in';

export const BuildStamp: React.FC<{ style?: StyleProp<TextStyle> }> = ({ style }) => {
  // In Expo Go and in dev there is no update to describe; the fields are null
  // and the line says "embedded", which is true.
  const id = Updates.updateId ?? null;
  const created = Updates.createdAt ?? null;

  return (
    <Text style={[styles.text, style]} selectable>
      build {shortId(id)} · {when(created)}
    </Text>
  );
};

const styles = StyleSheet.create({
  text: {
    color: COLORS.muted,
    fontSize: 10,
    opacity: 0.75,
    textAlign: 'center',
    marginTop: 4,
  },
});
