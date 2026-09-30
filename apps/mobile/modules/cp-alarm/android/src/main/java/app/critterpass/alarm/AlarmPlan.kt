package app.critterpass.alarm

import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

/** How the alarm rings (`NativeAlarmEngine`): exact only with the user's exact-alarm grant. */
enum class AlarmEngine(val wire: String) {
  EXACT("exact"),
  INEXACT("inexact"),
}

/** What a tap (or a hardware-button dismiss) on the ringing alarm does. */
data class AlarmOutcome(
  val action: String,
  /** Snoozes used after the tap: what `snooze_leave_by` carries and the event reports. */
  val snoozeCount: Int,
  /** The request to ring again with, or null when the alarm is done. */
  val ringAgain: AlarmRequest?,
)

/** What a reboot or clock change does with one stored alarm. */
enum class RestoreDecision {
  /** Set it again at its time. */
  SCHEDULE,
  /** Its time passed while the phone was off but the leave-by has not: ring now. */
  RING_NOW,
  /** The leave-by is over. */
  DROP,
}

/** The alarm's decisions, free of Android types so the JVM tests cover them. */
object AlarmPlan {
  fun engine(canScheduleExactAlarms: Boolean): AlarmEngine =
    if (canScheduleExactAlarms) AlarmEngine.EXACT else AlarmEngine.INEXACT

  /**
   * The designed full-screen alarm needs both the server flag (on only once Play approves the
   * full-screen-intent declaration) and the user's full-screen-intent access; otherwise the
   * high-priority notification with I'M UP / SNOOZE is the alarm.
   */
  fun useFullScreen(request: AlarmRequest, canUseFullScreenIntent: Boolean): Boolean =
    request.fullScreen && canUseFullScreenIntent

  /** "I'm up": the alarm is done, the snooze count stays as it was. */
  fun up(request: AlarmRequest) = AlarmOutcome("up", request.snoozeCount, null)

  /**
   * A snooze, from the SNOOZE button or a hardware-button dismiss: it always counts (the server
   * knocks the crew from the second one), and rings again only while the one snooze was unused.
   */
  fun snooze(request: AlarmRequest, nowMillis: Long): AlarmOutcome {
    val count = request.snoozeCount + 1
    val again = if (request.snoozeAllowed && request.snoozeMinutes > 0) request.snoozed(nowMillis) else null
    return AlarmOutcome("snooze", count, again)
  }

  fun restore(request: AlarmRequest, nowMillis: Long): RestoreDecision =
    when {
      request.leaveAtMillis <= nowMillis -> RestoreDecision.DROP
      request.fireAtMillis <= nowMillis -> RestoreDecision.RING_NOW
      else -> RestoreDecision.SCHEDULE
    }

  /** One PendingIntent request code per leave-by, stable across restarts. */
  fun requestCode(leaveById: String): Int = leaveById.lowercase().hashCode()

  /** `#RRGGBB` as an opaque ARGB int, or null. */
  fun tintArgb(hex: String): Int? {
    val digits = hex.removePrefix("#")
    if (digits.length != 6 || !digits.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) return null
    return (0xFF shl 24) or digits.toInt(16)
  }

  /** The big "03:10": the leave-by's wall-clock time where it happens (its own offset). */
  fun clockText(leaveAt: String): String =
    OffsetDateTime.parse(leaveAt).format(DateTimeFormatter.ofPattern("HH:mm"))
}
