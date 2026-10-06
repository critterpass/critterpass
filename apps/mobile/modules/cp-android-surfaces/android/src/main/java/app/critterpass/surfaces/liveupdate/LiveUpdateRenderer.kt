package app.critterpass.surfaces.liveupdate

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.critterpass.notifications.Channels
import app.critterpass.notifications.NotificationTap
import app.critterpass.notifications.NotificationTaps
import app.critterpass.notifications.R as NotificationsR
import app.critterpass.surfaces.R
import app.critterpass.surfaces.actions.ActionButtons
import app.critterpass.surfaces.actions.ActionTarget
import app.critterpass.surfaces.actions.SurfaceAction
import app.critterpass.surfaces.sos.SosChannel
import org.json.JSONObject

/**
 * Draws `la.<kind>` FCM messages (docs/api-contracts-async.md §3.2, Android row): a promoted
 * ongoing notification with `ProgressStyle` on API 36+ (`MetricStyle` on 37+ where the spec asks
 * for it), the same content as a plain ongoing notification below 36 or when the user turned
 * promotion off, and a heads-up or quiet notification for members the session is not theirs.
 * `start` and `update` replace one notification per object; `end` removes it.
 */
object LiveUpdateRenderer {
  private const val NOTIFICATION_ID = 50
  private const val LIVE_CHANNEL = "cp_trip"
  /** `Notification.EXTRA_REQUEST_PROMOTED_ONGOING`, by value so the extra compiles on every SDK. */
  private const val EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing"

  /** Handles a Live Activity step; false for any other message. */
  fun handle(context: Context, data: Map<String, String>): Boolean {
    val message = LiveUpdateMessage.parse(data) ?: return false
    val memory = LiveUpdateMemory(context)
    if (message.ends) {
      NotificationManagerCompat.from(context).cancel(message.tag, NOTIFICATION_ID)
      memory.forget(message.tag)
      return true
    }
    message.attributes?.let { memory.keepAttributes(message.tag, it) }
    val previousStatus = memory.status(message.tag)
    message.spec?.status?.let { memory.keepStatus(message.tag, it) }
    runCatching { post(context, message, memory.attributes(message.tag), previousStatus) }
    return true
  }

  fun canPromote(context: Context): Boolean =
    Build.VERSION.SDK_INT >= LiveUpdatePlan.PROGRESS_STYLE_MIN_SDK &&
      context.getSystemService(NotificationManager::class.java)?.canPostPromotedNotifications() == true

  @SuppressLint("MissingPermission")
  private fun post(context: Context, message: LiveUpdateMessage, attributes: JSONObject?, previousStatus: String?) {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return
    Channels.ensure(context)
    val form = LiveUpdatePlan.form(message.surface, Build.VERSION.SDK_INT, canPromote(context), message.spec)
    val content = Content.of(context, message, attributes)
    val tap = NotificationTap(null, null, "la.${message.kind}", null)
    val target = ActionTarget(null, message.tag, NOTIFICATION_ID, if (message.isLiveUpdate) "la_intent" else "notif_action", tap)
    val actions = message.actions(attributes?.optString("trip_id")?.takeIf { it.isNotBlank() })
    val notification = when (form) {
      LiveUpdateForm.METRIC, LiveUpdateForm.PROGRESS -> promoted(context, message, content, form, target, actions)
      else -> {
        val ongoing = form == LiveUpdateForm.ONGOING
        val statusChanged = previousStatus == null || previousStatus != message.spec?.status
        val builder = NotificationCompat.Builder(context, if (ongoing) LIVE_CHANNEL else alertChannel(context, message.channelId))
          .setSmallIcon(NotificationsR.drawable.cp_notification_icon)
          .setContentTitle(content.title)
          .setContentText(content.text)
          .setSubText(content.chip)
          .setOngoing(ongoing)
          .setAutoCancel(!ongoing)
          .setOnlyAlertOnce(ongoing || !statusChanged)
          .setPriority(if (form == LiveUpdateForm.QUIET) NotificationCompat.PRIORITY_LOW else NotificationCompat.PRIORITY_HIGH)
          .setCategory(if (message.kind == "sos") NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_STATUS)
          .setContentIntent(NotificationTaps.pendingIntent(context, tap, message.tag.hashCode()))
        message.spec?.takeIf { ongoing }?.let { builder.setProgress(it.max, it.progress.coerceAtMost(it.max), it.indeterminate) }
        actions.forEach { builder.addAction(ActionButtons.compat(context, it, target)) }
        builder.build()
      }
    }
    manager.notify(message.tag, NOTIFICATION_ID, notification)
  }

  @RequiresApi(LiveUpdatePlan.PROGRESS_STYLE_MIN_SDK)
  private fun promoted(
    context: Context,
    message: LiveUpdateMessage,
    content: Content,
    form: LiveUpdateForm,
    target: ActionTarget,
    actions: List<SurfaceAction>,
  ): Notification {
    val spec = requireNotNull(message.spec)
    val style: Notification.Style = if (form == LiveUpdateForm.METRIC && Build.VERSION.SDK_INT >= LiveUpdatePlan.METRIC_STYLE_MIN_SDK) {
      MetricStyleBuilder.style(spec.metrics) { metric -> Content.label(context, "cp_lu_metric_${metric.key}", metric.key) }
    } else {
      Notification.ProgressStyle().apply {
        setProgressIndeterminate(spec.indeterminate)
        spec.segments.forEach { addProgressSegment(Notification.ProgressStyle.Segment(it.length).setColor(it.tone.argb)) }
        spec.points
          .filter { it.position in 1 until spec.max }
          .forEach { addProgressPoint(Notification.ProgressStyle.Point(it.position).setColor(it.tone.argb)) }
        setProgress(spec.progress.coerceAtMost(spec.max))
      }
    }
    val builder = Notification.Builder(context, LIVE_CHANNEL)
      .setSmallIcon(NotificationsR.drawable.cp_notification_icon)
      .setContentTitle(content.title)
      .setContentText(content.text)
      .setShortCriticalText(content.chip)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_PROGRESS)
      .setStyle(style)
      .setContentIntent(NotificationTaps.pendingIntent(context, target.tap, message.tag.hashCode()))
    builder.extras.putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true)
    actions.forEach { builder.addAction(ActionButtons.platform(context, it, target)) }
    return builder.build()
  }

  /** A crewmate's SOS rings through Do Not Disturb once the user allowed it. */
  private fun alertChannel(context: Context, channelId: String): String =
    if (channelId == SosChannel.BASE_ID) SosChannel.effectiveId(context) else Channels.resolve(channelId)

  /** Title, status line and chip text in the reader's language. */
  private data class Content(val title: String, val text: String, val chip: String) {
    companion object {
      fun of(context: Context, message: LiveUpdateMessage, attributes: JSONObject?): Content {
        val spec = message.spec
        val state = message.state
        val title = spec?.title?.takeIf { it.isNotBlank() }
          ?: attributes?.optString("question")?.takeIf { it.isNotBlank() }
          ?: state?.optString("headline")?.takeIf { it.isNotBlank() }
          ?: context.getString(R.string.cp_lu_fallback_title)
        val text = spec?.let { label(context, "cp_lu_status_${it.status}", "") }?.takeIf { it.isNotEmpty() }
          ?: state?.optString("action_line").orEmpty()
        val chip = spec?.let { ChipText.of(it.chip, System.currentTimeMillis()) { key -> label(context, "cp_lu_chip_$key", key.uppercase()) } }.orEmpty()
        return Content(title, text, chip)
      }

      @SuppressLint("DiscouragedApi")
      fun label(context: Context, name: String, fallback: String): String {
        val id = context.resources.getIdentifier(name, "string", context.packageName)
        return if (id != 0) context.getString(id) else fallback
      }
    }
  }
}
