package app.critterpass.surfaces.permissions

/** What the device lets the surfaces do; every grant is false on a fresh install except notifications. */
data class SurfacePermissionState(
  val sdkInt: Int,
  val notifications: Boolean,
  /** `AlarmManager.canScheduleExactAlarms()` (denied by default from API 33). */
  val exactAlarm: Boolean,
  /** `NotificationManager.canUseFullScreenIntent()` (not granted to CritterPass by default from API 34). */
  val fullScreenIntent: Boolean,
  /** `NotificationManager.canPostPromotedNotifications()` (API 36+). */
  val promoted: Boolean,
  /** `NotificationManager.isNotificationPolicyAccessGranted`. */
  val dndAccess: Boolean,
)

enum class AlarmPath {
  /** Full-screen alarm activity over the lock screen, on time. */
  FULL_SCREEN_EXACT,

  /** Heads-up alarm notification on time. */
  HEADS_UP_EXACT,

  /** The default: heads-up alarm at an inexact time, with an earlier warning notification. */
  HEADS_UP_INEXACT,

  /** Notifications are off: only the in-app alarm screen. */
  IN_APP_ONLY,
}

enum class SosPath { BYPASS_DND, HIGH_RESPECTS_DND, IN_APP_ONLY }

enum class LiveUpdatePath { PROMOTED, ONGOING, NONE }

/** One settings row the app offers; ids match the JS explainer rows. */
enum class SettingsBanner(val id: String) {
  NOTIFICATIONS("notifications"),
  EXACT_ALARM("exact_alarm"),
  FULL_SCREEN_INTENT("full_screen_intent"),
  PROMOTED("promoted"),
  DND_ACCESS("dnd_access"),
}

/**
 * How every surface degrades (denied is the default row): the leave-by alarm, the SOS and Live
 * Updates, and which settings rows the app shows to lift each limit. Pure, so the whole matrix is
 * tested off-device.
 */
object DegradeMatrix {
  private const val FSI_RUNTIME_SDK = 34
  private const val EXACT_ALARM_DENIED_SDK = 31
  private const val LIVE_UPDATE_SDK = 36

  fun alarm(state: SurfacePermissionState): AlarmPath = when {
    !state.notifications -> AlarmPath.IN_APP_ONLY
    state.exactAlarm && state.fullScreenIntent -> AlarmPath.FULL_SCREEN_EXACT
    state.exactAlarm -> AlarmPath.HEADS_UP_EXACT
    else -> AlarmPath.HEADS_UP_INEXACT
  }

  fun sos(state: SurfacePermissionState): SosPath = when {
    !state.notifications -> SosPath.IN_APP_ONLY
    state.dndAccess -> SosPath.BYPASS_DND
    else -> SosPath.HIGH_RESPECTS_DND
  }

  fun liveUpdates(state: SurfacePermissionState): LiveUpdatePath = when {
    !state.notifications -> LiveUpdatePath.NONE
    state.sdkInt >= LIVE_UPDATE_SDK && state.promoted -> LiveUpdatePath.PROMOTED
    else -> LiveUpdatePath.ONGOING
  }

  /** Rows for limits the user can lift in settings; a limit the OS version does not have is not offered. */
  fun banners(state: SurfacePermissionState): List<SettingsBanner> = buildList {
    if (!state.notifications) {
      add(SettingsBanner.NOTIFICATIONS)
      return@buildList
    }
    if (state.sdkInt >= EXACT_ALARM_DENIED_SDK && !state.exactAlarm) add(SettingsBanner.EXACT_ALARM)
    if (state.sdkInt >= FSI_RUNTIME_SDK && !state.fullScreenIntent) add(SettingsBanner.FULL_SCREEN_INTENT)
    if (state.sdkInt >= LIVE_UPDATE_SDK && !state.promoted) add(SettingsBanner.PROMOTED)
    if (!state.dndAccess) add(SettingsBanner.DND_ACCESS)
  }
}
