package app.critterpass.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Alarms are cleared by a reboot and follow wall-clock changes badly; an app update or a new
 * exact-alarm grant also calls for setting them again (the engine may change).
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action !in ACTIONS) return
    val pending = goAsync()
    Thread {
      try {
        AlarmScheduler.restoreAll(context)
      } finally {
        pending.finish()
      }
    }.start()
  }

  private companion object {
    val ACTIONS =
      setOf(
        Intent.ACTION_BOOT_COMPLETED,
        Intent.ACTION_MY_PACKAGE_REPLACED,
        Intent.ACTION_TIME_CHANGED,
        Intent.ACTION_TIMEZONE_CHANGED,
        "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED",
      )
  }
}
