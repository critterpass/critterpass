package app.critterpass.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The alarm's broadcasts: the ring itself, the notification's I'M UP and SNOOZE actions, and the
 * notification being dismissed (which counts as a snooze, like a hardware-button dismiss).
 */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val leaveById = intent.getStringExtra(EXTRA_LEAVE_BY_ID) ?: return
    when (intent.action) {
      ACTION_FIRE -> ring(context, leaveById)
      ACTION_UP -> AlarmActions.up(context, leaveById)
      ACTION_SNOOZE, ACTION_DISMISSED -> AlarmActions.snooze(context, leaveById)
    }
  }

  companion object {
    const val ACTION_FIRE = "app.critterpass.alarm.FIRE"
    const val ACTION_UP = "app.critterpass.alarm.UP"
    const val ACTION_SNOOZE = "app.critterpass.alarm.SNOOZE"
    const val ACTION_DISMISSED = "app.critterpass.alarm.DISMISSED"
    const val EXTRA_LEAVE_BY_ID = "leaveById"

    fun intent(context: Context, action: String, leaveById: String): Intent =
      Intent(context, AlarmReceiver::class.java).setAction(action).putExtra(EXTRA_LEAVE_BY_ID, leaveById)

    /** Rings a stored alarm: the notification, with the full-screen activity when allowed. */
    fun ring(context: Context, leaveById: String) {
      val store = AlarmScheduler.store(context)
      val stored = store.get(leaveById) ?: return
      store.save(stored.copy(state = "alerting"))
      val fullScreen = AlarmPlan.useFullScreen(stored.request, AlarmScheduler.canUseFullScreenIntent(context))
      FallbackNotifier.show(context, stored.request, fullScreen = fullScreen, silent = false)
    }
  }
}
