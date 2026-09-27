package app.critterpass.spikeandroid.alarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

private const val CHANNEL_ID = "cp_spike_alarm"
private const val CHANNEL_NAME = "Spike alarm"
private const val NOTIFICATION_ID = 5101
private const val ACTIVITY_REQUEST_CODE = 5102

/**
 * `AlarmManager` fires this at the scheduled time. Always posts a heads-up notification with
 * `setFullScreenIntent` attached — whether that notification also auto-launches [AlarmActivity]
 * over the lock screen or stays a heads-up banner depends entirely on whether the OS granted this
 * app the full-screen-intent permission (`FullScreenIntentGate`), which this receiver does not
 * re-decide: it just always offers the full-screen intent and lets the OS apply the policy.
 */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val manager = context.getSystemService(NotificationManager::class.java)
    ensureChannel(manager)

    val fullScreenIntent = Intent(context, AlarmActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    }
    val fullScreenPendingIntent = PendingIntent.getActivity(
      context,
      ACTIVITY_REQUEST_CODE,
      fullScreenIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val notification = android.app.Notification.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle("Leave-by alarm")
      .setContentText("Tap to open")
      .setCategory(android.app.Notification.CATEGORY_ALARM)
      .setPriority(android.app.Notification.PRIORITY_HIGH)
      .setFullScreenIntent(fullScreenPendingIntent, true)
      .setContentIntent(fullScreenPendingIntent)
      .setAutoCancel(true)
      .build()

    manager.notify(NOTIFICATION_ID, notification)
  }

  private fun ensureChannel(manager: NotificationManager) {
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH)
    manager.createNotificationChannel(channel)
  }
}
