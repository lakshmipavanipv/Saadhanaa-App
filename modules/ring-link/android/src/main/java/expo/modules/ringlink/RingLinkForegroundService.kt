package expo.modules.ringlink

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Keeps the app's process — and with it the JS ring supervisor and the BLE
 * manager — alive while the app is not on screen.
 *
 * Android kills a backgrounded app's process whenever it feels the pressure,
 * and kills it immediately when the app is swiped out of recents. Every BLE
 * link the process owned dies with it, which is why vitals stopped syncing the
 * moment the app was closed and why the ring had to be re-paired by hand after
 * the phone was switched off. A foreground service is the only thing Android
 * offers that changes that answer.
 *
 * It extends HeadlessJsTaskService rather than plain Service because the boot
 * case has no activity: after a restart there is no JS running to supervise
 * anything, so the service has to bring up a React context of its own. When
 * the app IS in the foreground the task is allowed to run in the existing
 * context (`allowedInForeground = true`), so there is never a second copy of
 * the app's JS talking to the same ring.
 */
class RingLinkForegroundService : HeadlessJsTaskService() {

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Promote to foreground FIRST. Android gives a service a few seconds to
    // call startForeground() and crashes the app if it misses the window, and
    // starting the React context below can easily take longer than that on a
    // cold boot.
    try {
      startForegroundWithNotification()
    } catch (t: Throwable) {
      // Most likely ForegroundServiceStartNotAllowedException: the OS refused
      // a background start (Android 12+ has a short list of exemptions, and
      // OEM battery managers add their own rules). Nothing is gained by
      // crashing the user's app over it — the next time they open the app,
      // the module starts the service from the foreground, where it is
      // always allowed.
      Log.w(TAG, "could not enter foreground: ${t.message}")
      stopSelf()
      return START_NOT_STICKY
    }

    return try {
      super.onStartCommand(intent, flags, startId)
      // START_STICKY so the OS brings the service back if it is killed under
      // memory pressure — the whole point is to outlive that.
      START_STICKY
    } catch (t: Throwable) {
      Log.w(TAG, "headless task did not start: ${t.message}")
      START_STICKY
    }
  }

  /**
   * `timeout = 0` means no timeout: this task is meant to run for as long as
   * the service does. The JS side returns a promise it never settles, and the
   * task ends when the service is stopped.
   */
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig(TASK_NAME, Arguments.createMap(), 0, true)

  override fun onDestroy() {
    try {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } catch (t: Throwable) {
      Log.w(TAG, "stopForeground failed: ${t.message}")
    }
    super.onDestroy()
  }

  private fun startForegroundWithNotification() {
    ensureChannel(this)

    // Tapping the notification opens the app rather than doing nothing —
    // a permanent notification that is inert is just clutter.
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = launch?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Saadhana ring")
      .setContentText("Staying connected so beads and vitals keep syncing")
      .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
      .setOngoing(true)
      // MIN keeps it out of the status bar where the OS allows that; it still
      // appears in the shade, which Android requires for any foreground
      // service and we are not trying to hide.
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setShowWhen(false)
      .apply { contentIntent?.let { setContentIntent(it) } }
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  companion object {
    private const val TAG = "RingLinkService"

    /** Must match the name index.js registers the headless task under. */
    const val TASK_NAME = "RingLinkTask"

    private const val CHANNEL_ID = "ring-link"
    private const val NOTIFICATION_ID = 4711

    fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(CHANNEL_ID) != null) return
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Ring connection",
        // LOW: no sound, no vibration. This notification exists because
        // Android requires one, not because it has anything to announce.
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = "Keeps the ring connected while the app is closed"
        setShowBadge(false)
      }
      manager.createNotificationChannel(channel)
    }

    fun start(context: Context) {
      val intent = Intent(context, RingLinkForegroundService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, RingLinkForegroundService::class.java))
    }
  }
}
