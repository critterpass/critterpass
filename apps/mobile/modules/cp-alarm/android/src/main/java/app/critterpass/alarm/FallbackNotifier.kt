package app.critterpass.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build

/**
 * The alarm as a notification on the `cp_alarm` channel: the default everywhere, with I'M UP and
 * SNOOZE actions and a countdown to the leave-by, promoted to a Live Update on Android 16. With
 * [show]'s `fullScreen`, the same notification carries the full-screen intent that opens
 * [LeaveByAlarmActivity] over the lock screen.
 */
object FallbackNotifier {
  const val CHANNEL_ID = "cp_alarm"

  // Notification.EXTRA_REQUEST_PROMOTED_ONGOING (API 36), by value so older SDK stubs compile.
  private const val EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing"

  fun notificationId(leaveById: String): Int = AlarmPlan.requestCode(leaveById)

  fun show(context: Context, request: AlarmRequest, fullScreen: Boolean, silent: Boolean) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    ensureChannel(context, manager)
    val id = request.leaveById
    val builder =
      Notification.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
        .setContentTitle(request.title)
        .setContentText(request.subtitle)
        .setStyle(Notification.BigTextStyle().bigText("${request.subtitle}\n${request.guideLine}"))
        .setCategory(Notification.CATEGORY_ALARM)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(false)
        .setOnlyAlertOnce(silent)
        .setWhen(request.leaveAtMillis)
        .setShowWhen(true)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)
        .setContentIntent(if (fullScreen) activityIntent(context, request) else AlarmScheduler.openAppIntent(context))
        .setDeleteIntent(broadcast(context, AlarmReceiver.ACTION_DISMISSED, id))
        .addAction(action(context, request.labels.imUp, AlarmReceiver.ACTION_UP, id))
    if (request.snoozeAllowed) {
      builder.addAction(action(context, request.labels.snooze, AlarmReceiver.ACTION_SNOOZE, id))
    }
    if (fullScreen) builder.setFullScreenIntent(activityIntent(context, request), true)
    if (Build.VERSION.SDK_INT >= 36) {
      builder.extras.putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true)
    }
    val notification = builder.build()
    // Keeps sounding until the alarm is answered, like a clock app's alarm.
    if (!silent) notification.flags = notification.flags or Notification.FLAG_INSISTENT
    manager.notify(notificationId(id), notification)
  }

  fun cancel(context: Context, leaveById: String) {
    context.getSystemService(NotificationManager::class.java)?.cancel(notificationId(leaveById))
  }

  /**
   * The channel normally exists already (cp-notifications creates every app channel on start);
   * when the alarm is the first to need it, it is created with the alarm sound on the alarm
   * stream, which plays in silent mode.
   */
  private fun ensureChannel(context: Context, manager: NotificationManager) {
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel =
      NotificationChannel(CHANNEL_ID, context.getString(R.string.cp_alarm_channel), NotificationManager.IMPORTANCE_HIGH)
    channel.setSound(
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build(),
    )
    channel.enableVibration(true)
    channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    manager.createNotificationChannel(channel)
  }

  private fun action(context: Context, label: String, action: String, leaveById: String): Notification.Action =
    Notification.Action.Builder(null, label, broadcast(context, action, leaveById)).build()

  private fun broadcast(context: Context, action: String, leaveById: String): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      AlarmPlan.requestCode(leaveById) + action.hashCode(),
      AlarmReceiver.intent(context, action, leaveById),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  private fun activityIntent(context: Context, request: AlarmRequest): PendingIntent =
    PendingIntent.getActivity(
      context,
      AlarmPlan.requestCode(request.leaveById),
      Intent(context, LeaveByAlarmActivity::class.java)
        .putExtra(AlarmReceiver.EXTRA_LEAVE_BY_ID, request.leaveById)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}
