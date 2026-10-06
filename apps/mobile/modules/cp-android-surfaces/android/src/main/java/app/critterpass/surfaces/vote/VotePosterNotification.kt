package app.critterpass.surfaces.vote

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.critterpass.notifications.Channels
import app.critterpass.notifications.NotificationTap
import app.critterpass.notifications.NotificationTaps
import app.critterpass.notifications.R as NotificationsR
import app.critterpass.surfaces.R
import app.critterpass.surfaces.SnapshotStore
import app.critterpass.surfaces.actions.ActionButtons
import app.critterpass.surfaces.actions.ActionTarget
import app.critterpass.surfaces.actions.Categories
import org.json.JSONObject

/**
 * The vote push (5b-2) on Android: the baked poster frame as a big picture with one button per
 * option (up to three; OPEN when there is room). A vote from the shade is queued through the receiver and the
 * notification is re-posted with the stamp (the picked option, buttons gone), the way the
 * iOS content extension stamps its poster.
 */
object VotePosterNotification {
  private const val NOTIFICATION_ID = 1
  /** Baked by the critter-bake pipeline and copied into the shared assets by the app. */
  private const val POSTER_KEY = "posters/vote-frame"

  /** Handles a `cp.vote` data message; false when it is not one (cp-notifications renders it). */
  @SuppressLint("MissingPermission")
  fun post(context: Context, data: Map<String, String>): Boolean {
    if (data["category"] != "cp.vote") return false
    val cp = data["cp"]?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return false
    val nid = cp.optString("nid").ifEmpty { data["nid"].orEmpty() }
    val title = data["title"]?.takeIf { it.isNotBlank() } ?: return false
    val body = data["body"].orEmpty()
    if (nid.isEmpty()) return false
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return true
    Channels.ensure(context)
    val tap = NotificationTap(nid, cp.optString("deeplink").ifEmpty { null }, cp.optString("type").ifEmpty { null }, cp.optString("crew_id").ifEmpty { null })
    val target = ActionTarget("cp.vote", nid, NOTIFICATION_ID, "notif_action", tap)
    val builder = NotificationCompat.Builder(context, Channels.resolve(data["channel_id"]))
      .setSmallIcon(NotificationsR.drawable.cp_notification_icon)
      .setContentTitle(title)
      .setContentText(body)
      .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(NotificationTaps.pendingIntent(context, tap, nid.hashCode()))
    val poster = SnapshotStore.image(context, POSTER_KEY)
    builder.setStyle(
      if (poster != null) {
        NotificationCompat.BigPictureStyle().bigPicture(poster).setSummaryText(body)
      } else {
        NotificationCompat.BigTextStyle().bigText(body)
      },
    )
    val actions = Categories.actions("cp.vote", cp.optJSONObject("ctx"))
    builder.addExtras(
      Bundle().apply { actions.forEach { action -> action.label?.let { putString(optionExtra(action.payload["option_id"].toString()), it) } } },
    )
    actions.forEach { builder.addAction(ActionButtons.compat(context, it, target)) }
    manager.notify(nid, NOTIFICATION_ID, builder.build())
    return true
  }

  /** Re-posts the answered vote with the stamp; nothing when it was dismissed. */
  fun stamp(context: Context, tag: String, id: Int, optionId: String?) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val active = manager.activeNotifications.firstOrNull { it.tag == tag && it.id == id } ?: return
    val previous = active.notification
    val picked = optionId?.let { previous.extras.getString(optionExtra(it)) }
    val stampText = picked?.let { context.getString(R.string.cp_vote_stamp_option, it) } ?: context.getString(R.string.cp_vote_stamp)
    // The content tap still opens the vote; the option buttons are gone once answered.
    val rebuilt = Notification.Builder.recoverBuilder(context, previous)
      .setContentText(stampText)
      .setOnlyAlertOnce(true)
      .setActions()
      .build()
    manager.notify(tag, id, rebuilt)
  }

  private fun optionExtra(optionId: String) = "cp_vote_option_$optionId"
}
