package app.critterpass.surfaces.actions

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import app.critterpass.appgroup.PendingActionScope
import app.critterpass.appgroup.PendingActionVia
import app.critterpass.surfaces.vote.VotePosterNotification
import org.json.JSONObject

/**
 * A background button on a notification or Live Update (docs/api-contracts-async.md §4, Android
 * row): the command goes to the outbox and the expedited worker signs and sends it, so it works
 * from the locked shade without opening the app. The vote poster is re-posted with the stamp;
 * other notifications are cleared once answered; Live Updates wait for the server's next update.
 */
class NotificationActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION) return
    val command = intent.getStringExtra(EXTRA_COMMAND) ?: return
    val scope = intent.getStringExtra(EXTRA_SCOPE)?.let { runCatching { PendingActionScope.fromWire(it) }.getOrNull() } ?: return
    val via = runCatching { PendingActionVia.fromWire(intent.getStringExtra(EXTRA_VIA).orEmpty()) }
      .getOrDefault(PendingActionVia.NOTIF_ACTION)
    val payload = payloadOf(intent) ?: return
    PendingActions.enqueue(context, command, scope, via, payload)

    val tag = intent.getStringExtra(EXTRA_TAG) ?: return
    val id = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0)
    when {
      intent.getStringExtra(EXTRA_CATEGORY) == "cp.vote" ->
        VotePosterNotification.stamp(context, tag, id, payload["option_id"] as? String)
      via == PendingActionVia.NOTIF_ACTION -> NotificationManagerCompat.from(context).cancel(tag, id)
      else -> Unit
    }
  }

  /** The button's payload plus the typed reply, or null for a reply sent empty. */
  private fun payloadOf(intent: Intent): Map<String, Any>? {
    val json = runCatching { JSONObject(intent.getStringExtra(EXTRA_PAYLOAD) ?: "{}") }.getOrNull() ?: return null
    val payload = json.keys().asSequence().associateWith { json.get(it) }.toMutableMap()
    val replyKey = intent.getStringExtra(EXTRA_REPLY_KEY)
    if (replyKey != null) {
      val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY_REPLY)?.toString()?.trim()
      if (text.isNullOrEmpty()) return null
      payload[replyKey] = text
    }
    return payload
  }

  companion object {
    const val ACTION = "app.critterpass.surfaces.NOTIFICATION_ACTION"
    const val KEY_REPLY = "cp_reply"
    const val EXTRA_ID = "cp_action_id"
    const val EXTRA_COMMAND = "cp_action_command"
    const val EXTRA_SCOPE = "cp_action_scope"
    const val EXTRA_VIA = "cp_action_via"
    const val EXTRA_PAYLOAD = "cp_action_payload"
    const val EXTRA_REPLY_KEY = "cp_action_reply_key"
    const val EXTRA_CATEGORY = "cp_action_category"
    const val EXTRA_TAG = "cp_action_tag"
    const val EXTRA_NOTIFICATION_ID = "cp_action_notification_id"
  }
}
