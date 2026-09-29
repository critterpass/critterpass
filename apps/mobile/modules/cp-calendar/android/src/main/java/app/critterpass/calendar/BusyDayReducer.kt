package app.critterpass.calendar

import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** How a calendar block counts toward a day: busy time, or tentative ("maybe busy" when shared). */
enum class BlockKind { BUSY, TENTATIVE }

/** One block reduced to what the day count needs; nothing else about the event is ever read. */
data class BusyBlock(
  val startMillis: Long,
  val endMillis: Long,
  val kind: BlockKind,
  val allDay: Boolean,
)

/** One date's state as it leaves the device: the local date and free / maybe / busy. */
data class DayState(val date: String, val state: String) {
  fun toMap(): Map<String, String> = mapOf("date" to date, "state" to state)
}

/**
 * The same reduction the server runs (`reduceToDays` in packages/domain/src/setup/calendar.ts):
 * per local date only the waking hours 08:00–22:00 count; busy with an all-day busy block or at
 * least three busy hours, maybe (opt-in) with an all-day tentative block or at least three
 * tentative hours, otherwise free.
 */
object BusyDayReducer {
  const val MIN_BUSY_MINUTES = 180.0
  private val WAKING_START: LocalTime = LocalTime.of(8, 0)
  private val WAKING_END: LocalTime = LocalTime.of(22, 0)

  fun reduce(
    blocks: List<BusyBlock>,
    from: String,
    to: String,
    zone: ZoneId,
    includeTentative: Boolean,
  ): List<DayState> {
    val first = parse(from) ?: return emptyList()
    val last = parse(to) ?: return emptyList()
    val out = mutableListOf<DayState>()
    var day = first
    while (!day.isAfter(last)) {
      out.add(DayState(day.toString(), stateOf(day, blocks, zone, includeTentative)))
      day = day.plusDays(1)
    }
    return out
  }

  /**
   * CalendarContract stores an all-day instance at UTC midnight of its date; re-anchors it to
   * midnight of that date in the member's zone so it covers their own day.
   */
  fun allDayBlock(beginUtcMillis: Long, endUtcMillis: Long, kind: BlockKind, zone: ZoneId): BusyBlock {
    val utc = ZoneId.of("UTC")
    fun local(millis: Long): Long =
      java.time.Instant.ofEpochMilli(millis).atZone(utc).toLocalDate()
        .atStartOfDay(zone).toInstant().toEpochMilli()
    return BusyBlock(local(beginUtcMillis), local(endUtcMillis), kind, allDay = true)
  }

  private fun stateOf(day: LocalDate, blocks: List<BusyBlock>, zone: ZoneId, tentativeOn: Boolean): String {
    val start = day.atTime(WAKING_START).atZone(zone).toInstant().toEpochMilli()
    val end = day.atTime(WAKING_END).atZone(zone).toInstant().toEpochMilli()
    var busy = 0.0
    var tentative = 0.0
    var allDayBusy = false
    var allDayTentative = false
    for (block in blocks) {
      val minutes = maxOf(0L, minOf(end, block.endMillis) - maxOf(start, block.startMillis)) / 60_000.0
      if (minutes <= 0) continue
      when (block.kind) {
        BlockKind.BUSY -> {
          busy += minutes
          allDayBusy = allDayBusy || block.allDay
        }
        BlockKind.TENTATIVE -> {
          tentative += minutes
          allDayTentative = allDayTentative || block.allDay
        }
      }
    }
    return when {
      allDayBusy || busy >= MIN_BUSY_MINUTES -> "busy"
      tentativeOn && (allDayTentative || tentative >= MIN_BUSY_MINUTES) -> "maybe"
      else -> "free"
    }
  }

  private fun parse(iso: String): LocalDate? =
    try {
      LocalDate.parse(iso)
    } catch (_: java.time.format.DateTimeParseException) {
      null
    }
}
