package app.critterpass.alarm

import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID
import org.json.JSONObject

/** The copy the native alarm shows, already in the reader's language (`NativeAlarmLabels`). */
data class AlarmLabels(
  val imUp: String,
  val slide: String,
  val snooze: String,
  val snoozeNote: String,
  val crewPinged: String,
) {
  fun toJson(): JSONObject =
    JSONObject()
      .put("imUp", imUp)
      .put("slide", slide)
      .put("snooze", snooze)
      .put("snoozeNote", snoozeNote)
      .put("crewPinged", crewPinged)

  companion object {
    fun fromJson(json: JSONObject) =
      AlarmLabels(
        imUp = json.getString("imUp"),
        slide = json.getString("slide"),
        snooze = json.getString("snooze"),
        snoozeNote = json.getString("snoozeNote"),
        crewPinged = json.getString("crewPinged"),
      )
  }
}

/**
 * `NativeAlarmRequest` from modules/cp-alarm/src/CpAlarmModule.ts, field for field. The stored
 * schedule keeps it whole, so a reboot or a snooze rings again with the same copy while the app is
 * not running.
 */
data class AlarmRequest(
  val leaveById: String,
  val tripId: String,
  val fireAt: String,
  val leaveAt: String,
  val title: String,
  val subtitle: String,
  val guideLine: String,
  val tintHex: String,
  val snoozeAllowed: Boolean,
  val snoozeMinutes: Int,
  val snoozeCount: Int,
  val fullScreen: Boolean,
  val labels: AlarmLabels,
) {
  val fireAtMillis: Long get() = parseMillis(fireAt)
  val leaveAtMillis: Long get() = parseMillis(leaveAt)

  /** The request the one snooze rings with: `snoozeMinutes` from now, no snooze left. */
  fun snoozed(nowMillis: Long): AlarmRequest =
    copy(
      fireAt = formatMillis(nowMillis + snoozeMinutes * 60_000L),
      snoozeAllowed = false,
      snoozeCount = snoozeCount + 1,
    )

  /** Throws [IllegalArgumentException] for a request no alarm can be set from. */
  fun validate(nowMillis: Long) {
    require(runCatching { UUID.fromString(leaveById) }.isSuccess) { "$leaveById is not a leave-by id" }
    require(runCatching { fireAtMillis; leaveAtMillis }.isSuccess) {
      "fireAt and leaveAt must be ISO 8601 times with an offset"
    }
    require(AlarmPlan.tintArgb(tintHex) != null) { "$tintHex is not a #RRGGBB colour" }
    require(fireAtMillis > nowMillis) { "The alarm time $fireAt has already passed" }
  }

  fun toJson(): JSONObject =
    JSONObject()
      .put("leaveById", leaveById)
      .put("tripId", tripId)
      .put("fireAt", fireAt)
      .put("leaveAt", leaveAt)
      .put("title", title)
      .put("subtitle", subtitle)
      .put("guideLine", guideLine)
      .put("tintHex", tintHex)
      .put("snoozeAllowed", snoozeAllowed)
      .put("snoozeMinutes", snoozeMinutes)
      .put("snoozeCount", snoozeCount)
      .put("fullScreen", fullScreen)
      .put("labels", labels.toJson())

  companion object {
    fun fromJson(json: JSONObject) =
      AlarmRequest(
        leaveById = json.getString("leaveById").lowercase(),
        tripId = json.getString("tripId"),
        fireAt = json.getString("fireAt"),
        leaveAt = json.getString("leaveAt"),
        title = json.getString("title"),
        subtitle = json.getString("subtitle"),
        guideLine = json.getString("guideLine"),
        tintHex = json.getString("tintHex"),
        snoozeAllowed = json.getBoolean("snoozeAllowed"),
        snoozeMinutes = json.getInt("snoozeMinutes"),
        snoozeCount = json.getInt("snoozeCount"),
        fullScreen = json.getBoolean("fullScreen"),
        labels = AlarmLabels.fromJson(json.getJSONObject("labels")),
      )

    /** The JS object the module receives (numbers arrive as Double). */
    fun fromMap(map: Map<String, Any?>): AlarmRequest = fromJson(toJson(map))

    @Suppress("UNCHECKED_CAST")
    private fun toJson(map: Map<String, Any?>): JSONObject =
      JSONObject().also { json ->
        map.forEach { (key, value) ->
          json.put(key, if (value is Map<*, *>) toJson(value as Map<String, Any?>) else value)
        }
      }

    fun parseMillis(iso: String): Long = OffsetDateTime.parse(iso).toInstant().toEpochMilli()

    fun formatMillis(millis: Long): String =
      DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(millis))
  }
}
