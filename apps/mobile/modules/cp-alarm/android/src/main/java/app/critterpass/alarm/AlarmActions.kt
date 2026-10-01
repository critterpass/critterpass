package app.critterpass.alarm

import android.content.Context
import java.lang.ref.WeakReference

/**
 * One tap on the ringing alarm, from any surface (notification action, full-screen activity,
 * hardware button): queue the command in the App Group outbox, stop the ring, set the one snooze
 * again when it applies, and tell JS if it is listening. Returns the outcome, or null when the
 * alarm was already handled.
 */
object AlarmActions {
  fun up(context: Context, leaveById: String): AlarmOutcome? = handle(context, leaveById) { AlarmPlan.up(it) }

  fun snooze(context: Context, leaveById: String): AlarmOutcome? =
    handle(context, leaveById) { AlarmPlan.snooze(it, System.currentTimeMillis()) }

  private fun handle(context: Context, leaveById: String, decide: (AlarmRequest) -> AlarmOutcome): AlarmOutcome? {
    val store = AlarmScheduler.store(context)
    val stored = store.get(leaveById) ?: return null
    val now = System.currentTimeMillis()
    val outcome = decide(stored.request)
    AlarmOutbox.record(AlarmScheduler.appGroup(context), outcome, stored.leaveById, now)
    FallbackNotifier.cancel(context, stored.leaveById)
    val again = outcome.ringAgain
    if (again != null) AlarmScheduler.schedule(context, again, state = "snoozed") else store.remove(stored.leaveById)
    AlarmEvents.emit(
      mapOf(
        "leaveById" to stored.leaveById,
        "action" to outcome.action,
        "snoozeCount" to outcome.snoozeCount,
        "at" to AlarmRequest.formatMillis(now),
      ),
    )
    return outcome
  }
}

/** Hands alarm actions to the module's `onAlarmAction` event while JS is running. */
object AlarmEvents {
  @Volatile private var sink: WeakReference<(Map<String, Any>) -> Unit>? = null

  fun attach(listener: (Map<String, Any>) -> Unit) {
    sink = WeakReference(listener)
  }

  fun detach() {
    sink = null
  }

  fun emit(event: Map<String, Any>) {
    sink?.get()?.invoke(event)
  }
}
