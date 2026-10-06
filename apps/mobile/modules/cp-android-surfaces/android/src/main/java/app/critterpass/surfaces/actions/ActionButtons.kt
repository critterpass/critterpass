package app.critterpass.surfaces.actions

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import app.critterpass.notifications.NotificationTap
import app.critterpass.notifications.NotificationTaps
import app.critterpass.surfaces.R
import org.json.JSONObject

/** Where an action's notification lives, so the receiver can stamp or clear it afterwards. */
data class ActionTarget(
  val category: String?,
  val tag: String,
  val notificationId: Int,
  /** `notif_action` for notifications, `la_intent` for Live Update buttons, `widget` for widgets. */
  val via: String,
  /** What OPEN and other foreground buttons open. */
  val tap: NotificationTap,
)

/** Turns [SurfaceAction]s into notification buttons wired to [NotificationActionReceiver]. */
object ActionButtons {
  fun compat(context: Context, action: SurfaceAction, target: ActionTarget): NotificationCompat.Action {
    val builder = NotificationCompat.Action.Builder(0, label(context, action, target.category), intent(context, action, target))
    action.replyKey?.let {
      builder.addRemoteInput(RemoteInput.Builder(NotificationActionReceiver.KEY_REPLY).setLabel(label(context, action, target.category)).build())
      builder.setAllowGeneratedReplies(false)
    }
    if (!action.foreground) builder.setSemanticAction(semantic(action))
    return builder.build()
  }

  /** The same button for a platform `Notification.Builder` (Live Updates on API 36+). */
  fun platform(context: Context, action: SurfaceAction, target: ActionTarget): Notification.Action =
    Notification.Action.Builder(null as Icon?, label(context, action, target.category), intent(context, action, target)).build()

  fun label(context: Context, action: SurfaceAction, category: String?): String {
    action.label?.let { return it }
    val res = when (action.id) {
      "APPROVE" -> if (category == "cp.disruption") R.string.cp_action_do_it else R.string.cp_action_yes
      "DECLINE" -> R.string.cp_action_no
      "IM_UP" -> R.string.cp_action_im_up
      "SNOOZE" -> R.string.cp_action_snooze
      "LATE_10" -> R.string.cp_action_late_10
      "PING_ALL" -> R.string.cp_action_ping_all
      "ON_MY_WAY" -> R.string.cp_action_on_my_way
      "COMING" -> R.string.cp_action_coming
      "CONFIRM" -> R.string.cp_action_got_it
      "NUDGE" -> R.string.cp_action_nudge
      "REPLY" -> R.string.cp_action_reply
      "READ" -> R.string.cp_action_mark_read
      "IN" -> R.string.cp_action_im_in
      "MAYBE" -> R.string.cp_action_maybe
      "JOIN" -> R.string.cp_action_join
      "STOP_SHARE" -> R.string.cp_action_stop_sharing
      "freed" -> R.string.cp_action_can_make_it
      "not_movable" -> R.string.cp_action_cant_move_it
      else -> R.string.cp_action_open
    }
    return context.getString(res)
  }

  private fun semantic(action: SurfaceAction): Int = when (action.id) {
    "REPLY" -> NotificationCompat.Action.SEMANTIC_ACTION_REPLY
    "READ" -> NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ
    "DECLINE" -> NotificationCompat.Action.SEMANTIC_ACTION_DELETE
    else -> NotificationCompat.Action.SEMANTIC_ACTION_NONE
  }

  private fun intent(context: Context, action: SurfaceAction, target: ActionTarget): PendingIntent {
    val requestCode = "${target.tag}:${action.id}".hashCode()
    if (action.foreground || action.command == null) {
      return NotificationTaps.pendingIntent(context, target.tap, requestCode)
    }
    val broadcast = Intent(context, NotificationActionReceiver::class.java)
      .setAction(NotificationActionReceiver.ACTION)
      .putExtra(NotificationActionReceiver.EXTRA_ID, action.id)
      .putExtra(NotificationActionReceiver.EXTRA_COMMAND, action.command)
      .putExtra(NotificationActionReceiver.EXTRA_SCOPE, action.scope)
      .putExtra(NotificationActionReceiver.EXTRA_VIA, target.via)
      .putExtra(NotificationActionReceiver.EXTRA_PAYLOAD, JSONObject(action.payload).toString())
      .putExtra(NotificationActionReceiver.EXTRA_REPLY_KEY, action.replyKey)
      .putExtra(NotificationActionReceiver.EXTRA_CATEGORY, target.category)
      .putExtra(NotificationActionReceiver.EXTRA_TAG, target.tag)
      .putExtra(NotificationActionReceiver.EXTRA_NOTIFICATION_ID, target.notificationId)
    // A reply field needs a mutable intent so the system can add the typed text.
    val mutability = if (action.replyKey != null) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getBroadcast(context, requestCode, broadcast, PendingIntent.FLAG_UPDATE_CURRENT or mutability)
  }
}
