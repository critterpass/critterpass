package app.critterpass.surfaces.liveupdate

/** How one `la.<kind>` message is drawn on this device. */
enum class LiveUpdateForm {
  /** Promoted ongoing `Notification.MetricStyle` (API 37+, the spec asked for metrics). */
  METRIC,

  /** Promoted ongoing `Notification.ProgressStyle` (API 36+). */
  PROGRESS,

  /** Ongoing notification with the same content and a plain progress bar (below 36, or promotion off). */
  ONGOING,

  /** Heads-up notification, not ongoing: members who did not start or join the session. */
  ALERT,

  /** A quiet notification in the shade. */
  QUIET,
}

/**
 * The degrade matrix for Live Updates (product decisions: Live Updates from API 36, MetricStyle
 * from 37), as a pure function of the device and the message so it is tested off-device.
 */
object LiveUpdatePlan {
  const val PROGRESS_STYLE_MIN_SDK = 36
  const val METRIC_STYLE_MIN_SDK = 37

  /**
   * [surface] is the FCM `surface` field; [canPromote] is `NotificationManager
   * .canPostPromotedNotifications()` (false below 36, or when the user turned promotion off).
   */
  fun form(surface: String?, sdkInt: Int, canPromote: Boolean, spec: ProgressSpec?): LiveUpdateForm = when (surface) {
    null, "live_update" -> when {
      spec == null || sdkInt < PROGRESS_STYLE_MIN_SDK || !canPromote -> LiveUpdateForm.ONGOING
      spec.metricStyle && spec.metrics.isNotEmpty() && sdkInt >= METRIC_STYLE_MIN_SDK -> LiveUpdateForm.METRIC
      else -> LiveUpdateForm.PROGRESS
    }
    "standard" -> LiveUpdateForm.QUIET
    else -> LiveUpdateForm.ALERT
  }

  /** The member is told promotion is off (settings banner) when a Live Update had to fall back. */
  fun promotionBlocked(surface: String?, sdkInt: Int, canPromote: Boolean): Boolean =
    (surface == null || surface == "live_update") && sdkInt >= PROGRESS_STYLE_MIN_SDK && !canPromote
}
