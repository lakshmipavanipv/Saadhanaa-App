package expo.modules.ringlink

import android.app.ActivityManager
import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JS handle on the foreground service.
 *
 * Deliberately small: the decision of WHEN the ring should be held open is a
 * product decision and lives in TypeScript (src/soulsync/ring/ringLink.ts).
 * All this offers is "keep the process alive" and "stop keeping it alive".
 */
class RingLinkModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RingLink")

    /**
     * Start (or re-assert) the foreground service.
     *
     * `autoStart` also records that the ring should come back after a
     * restart. The two are asked for together because they answer the same
     * question — is there a ring worth staying connected to — and keeping
     * them in one call means the boot flag cannot drift out of step with the
     * service.
     */
    Function("start") {
      val context = appContext.reactContext ?: return@Function false
      RingLinkPrefs.setAutoStart(context, true)
      RingLinkForegroundService.ensureChannel(context)
      RingLinkForegroundService.start(context)
      true
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function false
      RingLinkPrefs.setAutoStart(context, false)
      RingLinkForegroundService.stop(context)
      true
    }

    Function("isRunning") {
      val context = appContext.reactContext ?: return@Function false
      isServiceRunning(context)
    }
  }

  /**
   * `getRunningServices` is deprecated for inspecting OTHER apps and returns
   * only our own services since API 26 — which is exactly what is being asked
   * here, and remains the only way to ask it.
   */
  @Suppress("DEPRECATION")
  private fun isServiceRunning(context: Context): Boolean = try {
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    manager.getRunningServices(Int.MAX_VALUE).any {
      it.service.className == RingLinkForegroundService::class.java.name
    }
  } catch (t: Throwable) {
    false
  }
}
