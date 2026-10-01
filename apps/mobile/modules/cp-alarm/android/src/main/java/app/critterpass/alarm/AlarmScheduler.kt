package app.critterpass.alarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import app.critterpass.appgroup.AppGroupStore

/**
 * Sets and clears the leave-by alarms: `setAlarmClock` when the user granted exact alarms (the
 * status-bar alarm icon, exempt from Doze), else `setAndAllowWhileIdle`, which may ring a few
 * minutes late. Every alarm is kept in [AlarmStore] so a reboot or clock change can set it again.
 */
object AlarmScheduler {
  fun appGroup(context: Context): AppGroupStore = AppGroupStore.inFilesDir(context.filesDir)

  fun store(context: Context) = AlarmStore(appGroup(context))

  fun canScheduleExactAlarms(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return context.getSystemService(AlarmManager::class.java)?.canScheduleExactAlarms() == true
  }

  fun canUseFullScreenIntent(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
    return context.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() == true
  }

  /** Sets (or replaces) the alarm for `request.leaveById` and stores it. */
  fun schedule(context: Context, request: AlarmRequest, state: String = "scheduled"): StoredAlarm {
    val engine = setAlarm(context, request)
    val stored = StoredAlarm(request, AlarmPlan.requestCode(request.leaveById).toString(), engine, state)
    store(context).save(stored)
    return stored
  }

  fun cancel(context: Context, leaveById: String) {
    context.getSystemService(AlarmManager::class.java)?.cancel(fireIntent(context, leaveById))
    FallbackNotifier.cancel(context, leaveById)
    store(context).remove(leaveById)
  }

  /** After a reboot, an app update or a clock change: set every stored alarm again. */
  fun restoreAll(context: Context, nowMillis: Long = System.currentTimeMillis()) {
    val store = store(context)
    for (stored in store.all()) {
      when (AlarmPlan.restore(stored.request, nowMillis)) {
        RestoreDecision.SCHEDULE -> store.save(stored.copy(engine = setAlarm(context, stored.request)))
        RestoreDecision.RING_NOW -> AlarmReceiver.ring(context, stored.leaveById)
        RestoreDecision.DROP -> store.remove(stored.leaveById)
      }
    }
  }

  private fun setAlarm(context: Context, request: AlarmRequest): AlarmEngine {
    val manager = context.getSystemService(AlarmManager::class.java) ?: return AlarmEngine.INEXACT
    val fire = fireIntent(context, request.leaveById)
    if (AlarmPlan.engine(canScheduleExactAlarms(context)) == AlarmEngine.EXACT) {
      try {
        manager.setAlarmClock(AlarmManager.AlarmClockInfo(request.fireAtMillis, openAppIntent(context)), fire)
        return AlarmEngine.EXACT
      } catch (_: SecurityException) {
        // The grant was revoked between the check and the call: ring inexactly instead.
      }
    }
    manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, request.fireAtMillis, fire)
    return AlarmEngine.INEXACT
  }

  private fun fireIntent(context: Context, leaveById: String): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      AlarmPlan.requestCode(leaveById),
      AlarmReceiver.intent(context, AlarmReceiver.ACTION_FIRE, leaveById),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  /** What tapping the status-bar alarm opens: the app. */
  fun openAppIntent(context: Context): PendingIntent? {
    val launch: Intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    return PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_IMMUTABLE)
  }
}
