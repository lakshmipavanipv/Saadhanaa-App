package expo.modules.ringlink

import android.content.Context

/**
 * The one bit of state the boot receiver needs, kept somewhere a receiver can
 * actually read it.
 *
 * The pairing itself lives in AsyncStorage, which is a SQLite database — at
 * boot there is no React context to query it through, and opening AsyncStorage's
 * private database from a broadcast receiver would tie this module to another
 * library's storage internals. So the JS side mirrors one boolean here
 * whenever a ring is paired or unbound, and the receiver reads that.
 */
internal object RingLinkPrefs {
  private const val PREFS = "ring-link"
  private const val KEY_AUTO_START = "auto_start"

  fun autoStartEnabled(context: Context): Boolean = try {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getBoolean(KEY_AUTO_START, false)
  } catch (t: Throwable) {
    false
  }

  fun setAutoStart(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_AUTO_START, enabled)
      .apply()
  }
}
