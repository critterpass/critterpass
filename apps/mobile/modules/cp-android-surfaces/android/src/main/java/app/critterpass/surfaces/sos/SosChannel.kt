package app.critterpass.surfaces.sos

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import app.critterpass.notifications.CpMessagingService
import app.critterpass.notifications.R as NotificationsR
import app.critterpass.notifications.SenderStyle

/**
 * A crewmate's SOS through Do Not Disturb. `cp_sos` (cp-notifications) is HIGH but respects DND,
 * and Android ignores `setBypassDnd` unless the app holds notification-policy access, and never
 * changes an existing channel's DND behaviour afterwards. So once the user grants the access,
 * `cp_sos_dnd` is created with the bypass and the alarm sound, and SOS pushes post there; without
 * the access they stay on `cp_sos` and the app shows the settings banner.
 */
object SosChannel {
  const val BASE_ID = "cp_sos"
  const val DND_ID = "cp_sos_dnd"

  fun policyAccessGranted(context: Context): Boolean =
    context.getSystemService(NotificationManager::class.java)?.isNotificationPolicyAccessGranted == true

  /** Creates the bypassing channel once access is granted; safe to call on every start and resume. */
  fun ensure(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !policyAccessGranted(context)) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(DND_ID) != null) return
    val channel = NotificationChannel(DND_ID, context.getString(NotificationsR.string.cp_channel_sos), NotificationManager.IMPORTANCE_HIGH).apply {
      description = context.getString(NotificationsR.string.cp_channel_sos_description)
      setBypassDnd(true)
      setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
        AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
      )
      enableVibration(true)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  /** True when SOS alerts will ring through Do Not Disturb. */
  fun bypassesDnd(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !policyAccessGranted(context)) return false
    return context.getSystemService(NotificationManager::class.java)?.getNotificationChannel(DND_ID)?.canBypassDnd() == true
  }

  /** The channel an SOS posts on now. */
  fun effectiveId(context: Context): String = if (bypassesDnd(context)) DND_ID else BASE_ID

  /**
   * Re-routes a `cp_sos` notification push to the bypassing channel when it exists, keeping
   * cp-notifications' sender rendering; false leaves the push to cp-notifications as it is.
   */
  fun handle(context: Context, data: Map<String, String>): Boolean {
    if (data["channel_id"] != BASE_ID) return false
    ensure(context)
    if (!bypassesDnd(context)) return false
    val message = SenderStyle.parse(data, guideNameFormat = context.getString(NotificationsR.string.cp_sender_guide_display_name))
      ?: return false
    runCatching { CpMessagingService.post(context, message.copy(channelId = DND_ID), data) }
    return true
  }
}
