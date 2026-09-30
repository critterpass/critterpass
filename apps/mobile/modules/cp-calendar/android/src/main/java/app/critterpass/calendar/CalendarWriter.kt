package app.critterpass.calendar

import android.content.ContentResolver
import android.content.ContentValues
import android.provider.CalendarContract.Calendars
import android.provider.CalendarContract.Events
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.time.Instant

/** One plan item to add (modules/cp-calendar/index.ts `PlanCalendarEvent`). */
class PlanEventRecord : Record {
  @Field val id: String = ""
  @Field val title: String = ""
  @Field val startsAt: String = ""
  @Field val endsAt: String = ""
  @Field val tz: String = ""
  @Field val notes: String? = null
}

/**
 * Adds the member's plan items to their primary writable calendar through CalendarContract
 * (WRITE_CALENDAR). Only the calendar list is read, to pick where the events go; no event is read
 * back. Each event links back to its plan item.
 */
object CalendarWriter {
  fun write(resolver: ContentResolver, events: List<PlanEventRecord>): Int {
    val calendarId = primaryCalendar(resolver)
      ?: throw CodedException("ERR_CALENDAR_WRITE", "No calendar on the device takes new events", null)
    var written = 0
    for (event in events) {
      val start = millis(event.startsAt) ?: continue
      val end = millis(event.endsAt) ?: continue
      if (end <= start) continue
      val values = ContentValues().apply {
        put(Events.CALENDAR_ID, calendarId)
        put(Events.TITLE, event.title)
        put(Events.DTSTART, start)
        put(Events.DTEND, end)
        put(Events.EVENT_TIMEZONE, event.tz)
        event.notes?.let { put(Events.DESCRIPTION, it) }
        put(Events.CUSTOM_APP_URI, "critterpass://plan/item/${event.id}")
      }
      if (resolver.insert(Events.CONTENT_URI, values) != null) written += 1
    }
    return written
  }

  private fun millis(iso: String): Long? = runCatching { Instant.parse(iso).toEpochMilli() }.getOrNull()

  /** The primary visible calendar that takes new events, else the first such calendar. */
  private fun primaryCalendar(resolver: ContentResolver): Long? {
    val selection =
      "${Calendars.VISIBLE} = 1 AND ${Calendars.CALENDAR_ACCESS_LEVEL} >= ${Calendars.CAL_ACCESS_CONTRIBUTOR}"
    var fallback: Long? = null
    resolver.query(
      Calendars.CONTENT_URI,
      arrayOf(Calendars._ID, Calendars.IS_PRIMARY),
      selection,
      null,
      null,
    )?.use { cursor ->
      while (cursor.moveToNext()) {
        val id = cursor.getLong(0)
        if (cursor.getInt(1) == 1) return id
        if (fallback == null) fallback = id
      }
    }
    return fallback
  }
}
