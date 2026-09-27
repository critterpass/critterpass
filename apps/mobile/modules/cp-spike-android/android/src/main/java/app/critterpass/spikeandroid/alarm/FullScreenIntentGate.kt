package app.critterpass.spikeandroid.alarm

/**
 * Pure decision for the API 34+ full-screen-intent permission rule (phase-02 "Android surfaces":
 * `canUseFullScreenIntent()` check, denied → Settings deep link). Below API 34,
 * `USE_FULL_SCREEN_INTENT` is a normal manifest permission granted at install time, so there is
 * nothing to check at runtime. Takes the OS's own answer as input so this stays testable on a
 * plain JVM — the real `NotificationManager.canUseFullScreenIntent()` call lives in the thin
 * wrapper (`CpSpikeAndroidModule.canUseFullScreenIntent`), not here.
 */
object FullScreenIntentGate {
  const val RUNTIME_CHECK_MIN_SDK = 34

  enum class Decision {
    GRANTED,
    REQUIRES_SETTINGS,
  }

  fun decide(sdkInt: Int, osReportsCanUseFullScreenIntent: Boolean): Decision =
    if (sdkInt < RUNTIME_CHECK_MIN_SDK || osReportsCanUseFullScreenIntent) {
      Decision.GRANTED
    } else {
      Decision.REQUIRES_SETTINGS
    }
}
