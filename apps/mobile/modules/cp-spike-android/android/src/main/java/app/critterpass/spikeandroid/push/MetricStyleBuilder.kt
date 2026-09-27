package app.critterpass.spikeandroid.push

import android.app.Notification
import android.content.Context

/**
 * `Notification.MetricStyle` (API 37) isolated in its own class so ART only resolves/verifies it
 * when [build] actually runs — call sites must gate with `SdkGuards.supportsMetricStyle` first.
 * If this were inlined into [LiveUpdateNotifier], the JVM's per-class verification could still
 * touch `Notification$MetricStyle` while verifying that shared class, even on an API 36 device
 * whose framework doesn't have it, risking a `VerifyError` instead of the clean fallback the spike
 * requires (product decisions: "MetricStyle path gated >= 37 with a verified fallback on
 * 36").
 */
internal object MetricStyleBuilder {
  fun build(context: Context, channelId: String, payload: AndroidSurfacesPushPayload): Notification {
    val metric = Notification.Metric(
      Notification.Metric.FixedFloat(payload.metricValue ?: 0f),
      payload.metricLabel ?: payload.kind,
    )
    val style = Notification.MetricStyle().addMetric(metric)

    return Notification.Builder(context, channelId)
      .setSmallIcon(android.R.drawable.ic_popup_reminder)
      .setContentTitle(payload.kind)
      .setContentText(payload.chip)
      .setOngoing(true)
      .setRequestPromotedOngoing(true)
      .setStyle(style)
      .build()
  }
}
