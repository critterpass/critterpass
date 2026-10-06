package app.critterpass.surfaces.widgets

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import app.critterpass.appgroup.PendingActionScope
import app.critterpass.appgroup.PendingActionVia
import app.critterpass.surfaces.actions.PendingActions

/**
 * Widget taps that act without opening the app (docs/api-contracts-async.md §4): each queues its
 * command in the shared outbox with `via: widget` and the worker signs and sends it; the server's
 * answer refreshes every widget through `widget.refresh`.
 */
class VoteCallback : ActionCallback {
  override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
    val poll = parameters[POLL] ?: return
    val option = parameters[OPTION] ?: return
    PendingActions.enqueue(context, "cast_ballot", PendingActionScope.BALLOT, PendingActionVia.WIDGET, mapOf("poll_id" to poll, "option_id" to option))
  }

  companion object {
    val POLL = ActionParameters.Key<String>("poll_id")
    val OPTION = ActionParameters.Key<String>("option_id")
  }
}

class PackingCallback : ActionCallback {
  override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
    val item = parameters[ITEM] ?: return
    PendingActions.enqueue(context, "check_packing_item", PendingActionScope.TRIP_DAY, PendingActionVia.WIDGET, mapOf("item_id" to item, "checked" to true))
  }

  companion object {
    val ITEM = ActionParameters.Key<String>("item_id")
  }
}

class NudgeCallback : ActionCallback {
  override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
    val user = parameters[USER]?.takeIf { it.isNotEmpty() } ?: return
    PendingActions.enqueue(context, "send_nudge", PendingActionScope.MONEY_NUDGE, PendingActionVia.WIDGET, mapOf("target_uid" to user, "reason" to "payment"))
  }

  companion object {
    val USER = ActionParameters.Key<String>("target_uid")
  }
}
