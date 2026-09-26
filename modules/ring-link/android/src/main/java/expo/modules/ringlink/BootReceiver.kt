package expo.modules.ringlink

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Brings the ring link back after the phone is switched on.
 *
 * "Switch the phone off and the ring never comes back" was half a missing
 * Bluetooth listener and half this: nothing in the app ran again until the
 * user opened it by hand, so a phone restarted at night synced nothing until
 * somebody noticed.
 *
 * Only starts when a ring is actually paired. A freshly installed app, or one
 * whose ring has been unbound, has nothing to connect to, and a permanent
 * notification for a service with no work to do is an unpleasant thing to
 * find on your phone after a restart.
 */
class BootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (action !in BOOT_ACTIONS) return

    if (!RingLinkPrefs.autoStartEnabled(context)) {
      Log.i(TAG, "boot: no ring paired, staying asleep")
      return
    }

    try {
      RingLinkForegroundService.start(context)
      Log.i(TAG, "boot: ring link service started")
    } catch (t: Throwable) {
      // Android 12+ can refuse a foreground-service start from the
      // background, and several OEM launchers refuse boot starts outright
      // until the user allows autostart. Losing the restart is survivable —
      // opening the app starts the service — but crashing in a boot receiver
      // is not, so this is swallowed deliberately.
      Log.w(TAG, "boot: could not start service: ${t.message}")
    }
  }

  companion object {
    private const val TAG = "RingLinkBoot"

    private val BOOT_ACTIONS = setOf(
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_LOCKED_BOOT_COMPLETED,
      "android.intent.action.QUICKBOOT_POWERON",
      "com.htc.intent.action.QUICKBOOT_POWERON",
    )
  }
}
