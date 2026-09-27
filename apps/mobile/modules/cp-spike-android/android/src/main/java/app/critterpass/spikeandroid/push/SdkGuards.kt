package app.critterpass.spikeandroid.push

/**
 * API-level gates for the promoted Live Update notification surfaces (phase-02 "Android
 * surfaces", product-decisions.md D2: Live Updates 36+, `MetricStyle` 37+). Pure functions of an
 * injected SDK int so they're unit-testable on a plain JVM without Robolectric — call sites pass
 * `Build.VERSION.SDK_INT`.
 */
object SdkGuards {
  const val PROGRESS_STYLE_MIN_SDK = 36
  const val METRIC_STYLE_MIN_SDK = 37

  /** `Notification.ProgressStyle` exists from API 36; below that, a plain progress notification. */
  fun supportsProgressStyle(sdkInt: Int): Boolean = sdkInt >= PROGRESS_STYLE_MIN_SDK

  /** `Notification.MetricStyle` exists from API 37; the fallback on 36 is `ProgressStyle` alone. */
  fun supportsMetricStyle(sdkInt: Int): Boolean = sdkInt >= METRIC_STYLE_MIN_SDK
}
