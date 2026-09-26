/**
 * The headless task the foreground service runs.
 *
 * Two situations reach this file:
 *
 *   • The app is open. React Native runs the task in the JS context that is
 *     already there, so `ringLink.start()` finds the supervisor the app
 *     bootstrap already started and does nothing — the `started` guard makes
 *     that a no-op rather than a second reconnect loop.
 *
 *   • The phone has just restarted and nobody has opened the app. There is no
 *     React context until the service creates one, and this is the first and
 *     only thing running in it. Starting the supervisor here is what makes a
 *     ring reconnect after a restart without the app being opened.
 *
 * The returned promise is never settled, on purpose. A headless task ends when
 * its promise resolves, and this one should end only when the service is
 * stopped — which tears the task down from the native side.
 */

import { ringLink } from './ringLink';

export default async function ringLinkTask(): Promise<void> {
  ringLink.start();
  // Never resolves — see above.
  return new Promise<void>(() => { /* held open for the life of the service */ });
}
