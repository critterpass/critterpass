package app.critterpass.surfaces.liveupdate

import android.app.Notification
import androidx.annotation.RequiresApi

/**
 * `Notification.MetricStyle` (API 37) in its own class, so the runtime only resolves it when
 * [style] runs: callers check `LiveUpdatePlan.METRIC_STYLE_MIN_SDK` first, and an API 36 device
 * never verifies a class it does not have. Up to three metrics, each a number with its label.
 */
@RequiresApi(LiveUpdatePlan.METRIC_STYLE_MIN_SDK)
internal object MetricStyleBuilder {
  fun style(metrics: List<ProgressSpec.Metric>, label: (ProgressSpec.Metric) -> String): Notification.Style {
    val style = Notification.MetricStyle()
    metrics.take(3).forEach { metric ->
      style.addMetric(Notification.Metric(Notification.Metric.FixedFloat(metric.value.toFloat()), label(metric)))
    }
    return style
  }
}
