package app.critterpass.calendar

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.provider.CalendarContract.Events
import android.provider.CalendarContract.Instances
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.time.LocalDate
import java.time.ZoneId

/**
 * Date-level availability from the device's calendars (modules/cp-calendar/index.ts). Instances
 * are read with a projection of begin, end, all-day, availability and status only (never the
 * title, description, place or attendees) and reduced to one free / maybe / busy per local date
 * before anything returns. READ_CALENDAR is asked for by cp-permissions; without it the read
 * rejects with `ERR_CALENDAR_ACCESS`.
 */
class CpCalendarModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CpCalendar")

    Function("hasAccess") { granted() }

    AsyncFunction("readBusyDays") { from: String, to: String, tz: String, includeTentative: Boolean ->
      if (!granted()) {
        throw CodedException("ERR_CALENDAR_ACCESS", "Calendar access is not granted", null)
      }
      val zone = runCatching { ZoneId.of(tz) }.getOrDefault(ZoneId.systemDefault())
      BusyDayReducer.reduce(blocks(from, to, zone), from, to, zone, includeTentative).map { it.toMap() }
    }
  }

  private fun granted(): Boolean {
    val context = appContext.reactContext ?: return false
    return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR) ==
      PackageManager.PERMISSION_GRANTED
  }

  private fun blocks(from: String, to: String, zone: ZoneId): List<BusyBlock> {
    val resolver = appContext.reactContext?.contentResolver ?: return emptyList()
    val start = LocalDate.parse(from).minusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
    val end = LocalDate.parse(to).plusDays(2).atStartOfDay(zone).toInstant().toEpochMilli()
    val uri = Instances.CONTENT_URI.buildUpon().also {
      ContentUris.appendId(it, start)
      ContentUris.appendId(it, end)
    }.build()
    val out = mutableListOf<BusyBlock>()
    resolver.query(uri, PROJECTION, null, null, null)?.use { cursor ->
      while (cursor.moveToNext()) {
        val status = cursor.getInt(4)
        if (status == Events.STATUS_CANCELED) continue
        val kind = when (cursor.getInt(3)) {
          Events.AVAILABILITY_FREE -> continue
          Events.AVAILABILITY_TENTATIVE -> BlockKind.TENTATIVE
          else -> if (status == Events.STATUS_TENTATIVE) BlockKind.TENTATIVE else BlockKind.BUSY
        }
        val begin = cursor.getLong(0)
        val finish = cursor.getLong(1)
        out.add(
          if (cursor.getInt(2) == 1) BusyDayReducer.allDayBlock(begin, finish, kind, zone)
          else BusyBlock(begin, finish, kind, allDay = false)
        )
      }
    }
    return out
  }

  private companion object {
    /** Only what the day count needs: never the title, description, place or attendees. */
    val PROJECTION = arrayOf(
      Instances.BEGIN,
      Instances.END,
      Instances.ALL_DAY,
      Instances.AVAILABILITY,
      Instances.STATUS,
    )
  }
}
