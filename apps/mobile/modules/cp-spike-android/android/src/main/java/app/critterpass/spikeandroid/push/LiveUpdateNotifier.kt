package app.critterpass.spikeandroid.push

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat

private const val CHANNEL_ID = "cp_spike_live_update"
private const val CHANNEL_NAME = "Spike live updates"
internal const val LIVE_UPDATE_NOTIFICATION_ID = 4201

/**
 * Posts/updates/cancels the promoted Live Update notification per SDK gate (the "Android
 * surfaces" step 2–3): `Notification.ProgressStyle` (36+, `MetricStyle` swapped in on 37+ when the
 * payload carries a metric), a plain `NotificationCompat` progress notification below 36.
 */
object LiveUpdateNotifier {
  fun postOrUpdate(context: Context, payload: AndroidSurfacesPushPayload) {
    val manager = context.getSystemService(NotificationManager::class.java)
    ensureChannel(manager)

    if (payload.op == PushOp.END) {
      manager.cancel(LIVE_UPDATE_NOTIFICATION_ID)
      return
    }

    val notification = if (SdkGuards.supportsProgressStyle(Build.VERSION.SDK_INT)) {
      buildPromotedNotification(context, payload)
    } else {
      buildFallbackNotification(context, payload)
    }
    manager.notify(LIVE_UPDATE_NOTIFICATION_ID, notification)
  }

  fun dismiss(context: Context) {
    context.getSystemService(NotificationManager::class.java).cancel(LIVE_UPDATE_NOTIFICATION_ID)
  }

  private fun ensureChannel(manager: NotificationManager) {
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW),
    )
  }

  /** API 36+: `ProgressStyle`, replaced by `MetricStyle` on 37+ when the payload has a metric. */
  private fun buildPromotedNotification(context: Context, payload: AndroidSurfacesPushPayload): Notification {
    if (SdkGuards.supportsMetricStyle(Build.VERSION.SDK_INT) &&
      payload.metricLabel != null &&
      payload.metricValue != null
    ) {
      return MetricStyleBuilder.build(context, CHANNEL_ID, payload)
    }

    val style = Notification.ProgressStyle()
      .addProgressSegment(Notification.ProgressStyle.Segment(payload.progressMax))
      .setProgress(payload.progress)

    return Notification.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_popup_reminder)
      .setContentTitle(payload.kind)
      .setContentText(payload.chip)
      .setOngoing(true)
      .setRequestPromotedOngoing(true)
      .setStyle(style)
      .build()
  }

  /** Below API 36: the fallback named in the spike's requirements table. */
  private fun buildFallbackNotification(context: Context, payload: AndroidSurfacesPushPayload): Notification =
    NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_popup_reminder)
      .setContentTitle(payload.kind)
      .setContentText(payload.chip)
      .setOngoing(true)
      .setProgress(payload.progressMax, payload.progress, false)
      .build()
}
