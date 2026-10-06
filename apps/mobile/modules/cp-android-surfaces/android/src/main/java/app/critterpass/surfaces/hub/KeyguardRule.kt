package app.critterpass.surfaces.hub

/**
 * Lock-screen widgets came back in Android 16 QPR2 (minor SDK 36.1), for large screens and the
 * hub first; phones mostly do not offer them. The gallery shows the lock-screen row only when
 * the probe passes, and otherwise keeps it hidden with an explanation. Pure, tested off-device.
 */
object KeyguardRule {
  /** `Build.VERSION_CODES_FULL.BAKLAVA_1`: Android 16 QPR2. */
  const val KEYGUARD_WIDGETS_SDK_FULL = 3_600_001
  const val LARGE_SCREEN_DP = 600

  fun supported(sdkInt: Int, sdkIntFull: Int?, smallestWidthDp: Int): Boolean {
    val full = sdkIntFull ?: (sdkInt * 100_000)
    return full >= KEYGUARD_WIDGETS_SDK_FULL && smallestWidthDp >= LARGE_SCREEN_DP
  }
}
