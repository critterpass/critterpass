package app.critterpass.spikeandroid.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock

private const val ALARM_REQUEST_CODE = 5100

/**
 * Schedules/cancels the full-screen-intent alarm. `SCHEDULE_EXACT_ALARM` is user-granted and
 * revocable (product-decisions.md §4) — never `USE_EXACT_ALARM`, which Play restricts to
 * alarm-clock/calendar apps. Below API 31 there's nothing to check: exact alarms were ungated.
 */
object AlarmScheduler {
  fun canScheduleExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
  }

  /**
   * Schedules [AlarmReceiver] `delaySeconds` from now. Exact (`setExactAndAllowWhileIdle`) when
   * granted; otherwise an inexact `setAndAllowWhileIdle` — the denied-by-default degrade path this
   * spike proves rather than assumes.
   */
  fun schedule(context: Context, delaySeconds: Long) {
    val alarmManager = context.getSystemService(AlarmManager::class.java)
    val triggerAtMillis = SystemClock.elapsedRealtime() + delaySeconds * 1000
    val pendingIntent = alarmPendingIntent(context)

    if (canScheduleExact(context)) {
      alarmManager.setExactAndAllowWhileIdle(
        AlarmManager.ELAPSED_REALTIME_WAKEUP,
        triggerAtMillis,
        pendingIntent,
      )
    } else {
      alarmManager.setAndAllowWhileIdle(
        AlarmManager.ELAPSED_REALTIME_WAKEUP,
        triggerAtMillis,
        pendingIntent,
      )
    }
  }

  fun cancel(context: Context) {
    context.getSystemService(AlarmManager::class.java).cancel(alarmPendingIntent(context))
  }

  private fun alarmPendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java)
    return PendingIntent.getBroadcast(
      context,
      ALARM_REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}
