package app.critterpass.location

/** The fields of an `android.location.Location` the engine needs, kept free of Android types. */
data class RawFix(
  val lat: Double,
  val lng: Double,
  val accuracyM: Float?,
  val timeMs: Long,
  val speedMps: Float?,
  val isMock: Boolean,
)

/**
 * Maps fixes and accuracy tiers for the fused provider. Tier priorities are the documented
 * `com.google.android.gms.location.Priority` values (100 high accuracy, 102 balanced, 104 low
 * power), repeated here so this file stays JVM-testable.
 */
object FixStream {
  const val PRIORITY_HIGH_ACCURACY = 100
  const val PRIORITY_BALANCED = 102
  const val PRIORITY_LOW_POWER = 104

  data class Request(val priority: Int, val intervalMs: Long, val minDistanceM: Float)

  /** Null for `paused`: no updates at all while the phone rests. */
  fun requestFor(tier: String): Request? =
    when (tier) {
      "high" -> Request(PRIORITY_HIGH_ACCURACY, 5_000, 5f)
      "balanced" -> Request(PRIORITY_BALANCED, 20_000, 25f)
      "coarse" -> Request(PRIORITY_LOW_POWER, 60_000, 100f)
      else -> null
    }

  /** Anti-spoof bits shared with `@cp/domain`: 1 = mock provider (Android has no accessory flag). */
  fun mockFlags(isMock: Boolean): Int = if (isMock) 1 else 0

  fun body(fix: RawFix, stationary: Boolean): Map<String, Any> {
    val body = mutableMapOf<String, Any>(
      "lat" to fix.lat,
      "lng" to fix.lng,
      "acc" to (fix.accuracyM?.toDouble() ?: 1000.0),
      "at" to fix.timeMs.toDouble(),
      "stationary" to stationary,
      "mock" to mockFlags(fix.isMock),
    )
    fix.speedMps?.takeIf { it >= 0f }?.let { body["speed"] = it.toDouble() }
    return body
  }

  /** Below 0.3 m/s for a while reads as standing still (the fused provider has no such flag). */
  fun isStationary(recentSpeedsMps: List<Float>): Boolean =
    recentSpeedsMps.size >= 3 && recentSpeedsMps.takeLast(3).all { it in 0f..0.3f }
}
