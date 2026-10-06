package app.critterpass.surfaces.widgets

import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

/**
 * The fields of `snapshot/widgets.json` (packages/domain/src/surfaces/widget-snapshot.ts, schema 1)
 * the Android widgets draw. Unknown fields are ignored and a section that fails to read is absent,
 * so a newer writer never blanks an older widget. Pure: org.json only.
 */
data class WidgetSnapshot(
  val generatedAtMillis: Long,
  val tripId: String?,
  val destination: String?,
  val countdownTargetMillis: Long?,
  val vote: Vote?,
  val today: Today?,
  val balances: Balances?,
  val crew: Crew?,
  val critterdexFound: Int,
  val critterdexTotal: Int,
  val nextFlight: Flight?,
  val nextLeaveBy: LeaveBy?,
  val passPlus: Boolean,
  val boostActive: Boolean,
  val locked: Set<String>,
) {
  data class VoteOption(val id: String, val label: String, val votes: Int)

  data class Vote(
    val pollId: String,
    val question: String?,
    val open: Boolean,
    val closesAtMillis: Long?,
    val options: List<VoteOption>,
    val voted: Int,
    val eligible: Int,
    val myOptionId: String?,
    val winnerOptionId: String?,
  )

  data class PlanRow(val startsAtMillis: Long, val title: String)

  data class PackingItem(val id: String, val label: String, val checked: Boolean)

  data class Today(val briefing: List<String>, val plan: List<PlanRow>, val packing: List<PackingItem>, val tempMaxC: Int?, val condition: String?)

  data class Balances(val currency: String, val netMinor: Long, val nudgeUserId: String?, val nudgeFirstName: String?, val nudgeAvailableAtMillis: Long?)

  data class CrewMember(val bucket: String, val initial: String)

  data class Crew(val meetupPlace: String?, val meetAtMillis: Long?, val members: List<CrewMember>)

  data class Flight(
    val carrier: String,
    val flightNo: String,
    val from: String,
    val to: String,
    val departsAtMillis: Long,
    val gate: String?,
    val status: String,
    val delayMin: Int?,
  )

  data class LeaveBy(val title: String, val placeName: String?, val leaveAtMillis: Long)

  companion object {
    const val SCHEMA = 1

    /** Null for a file of another schema version. */
    fun parse(json: JSONObject): WidgetSnapshot? {
      if (json.optInt("schema", -1) != SCHEMA) return null
      val entitlements = json.optJSONObject("entitlements")
      val dex = json.optJSONObject("critterdex")
      return WidgetSnapshot(
        generatedAtMillis = instant(json.optStringOrNull("generated_at")) ?: 0L,
        tripId = json.optJSONObject("trip")?.optStringOrNull("id"),
        destination = json.optJSONObject("trip")?.optStringOrNull("destination"),
        countdownTargetMillis = instant(json.optJSONObject("countdown")?.optStringOrNull("target_at")),
        vote = section(json, "vote", ::vote),
        today = section(json, "today", ::today),
        balances = section(json, "balances", ::balances),
        crew = section(json, "crew", ::crew),
        critterdexFound = dex?.optInt("found", 0) ?: 0,
        critterdexTotal = dex?.optInt("total", 0) ?: 0,
        nextFlight = section(json, "next_flight", ::flight),
        nextLeaveBy = section(json, "next_leave_by", ::leaveBy),
        passPlus = entitlements?.optBoolean("pass_plus", false) ?: false,
        boostActive = entitlements?.optBoolean("boost_active", false) ?: false,
        locked = json.optJSONArray("locked")?.strings()?.toSet().orEmpty(),
      )
    }

    private fun <T> section(json: JSONObject, key: String, read: (JSONObject) -> T): T? =
      json.optJSONObject(key)?.let { runCatching { read(it) }.getOrNull() }

    private fun vote(o: JSONObject) = Vote(
      pollId = o.getString("poll_id"),
      question = o.optStringOrNull("question"),
      open = o.optString("status") == "open",
      closesAtMillis = instant(o.optStringOrNull("closes_at")),
      options = o.optJSONArray("options").objects().map { VoteOption(it.getString("id"), it.getString("label"), it.optInt("votes")) },
      voted = o.optInt("voted"),
      eligible = o.optInt("eligible"),
      myOptionId = o.optStringOrNull("my_option_id"),
      winnerOptionId = o.optStringOrNull("winner_option_id"),
    )

    private fun today(o: JSONObject): Today {
      val forecast = o.optJSONObject("forecast")
      return Today(
        briefing = o.optJSONArray("items").objects().map { it.getString("text") },
        plan = o.optJSONArray("plan").objects().mapNotNull { row ->
          instant(row.optStringOrNull("starts_at"))?.let { PlanRow(it, row.getString("title")) }
        },
        packing = o.optJSONArray("packing").objects().map { PackingItem(it.getString("id"), it.getString("label"), it.optBoolean("checked")) },
        tempMaxC = forecast?.takeIf { it.has("temp_max_c") }?.optInt("temp_max_c"),
        condition = forecast?.optStringOrNull("condition"),
      )
    }

    private fun balances(o: JSONObject): Balances {
      val nudge = o.optJSONObject("nudge")
      return Balances(
        currency = o.getString("currency"),
        netMinor = o.getLong("net_minor"),
        nudgeUserId = nudge?.optStringOrNull("user_id"),
        nudgeFirstName = nudge?.optStringOrNull("first_name"),
        nudgeAvailableAtMillis = instant(nudge?.optStringOrNull("available_at")),
      )
    }

    private fun crew(o: JSONObject): Crew {
      val meetup = o.optJSONObject("meetup")
      return Crew(
        meetupPlace = meetup?.optStringOrNull("place_name"),
        meetAtMillis = instant(meetup?.optStringOrNull("meet_at")),
        members = o.optJSONArray("members").objects().map { CrewMember(it.optString("bucket", "unknown"), it.optString("initial", "?")) },
      )
    }

    private fun flight(o: JSONObject) = Flight(
      carrier = o.optString("carrier"),
      flightNo = o.getString("flight_no"),
      from = o.optString("dep_airport"),
      to = o.optString("arr_airport"),
      departsAtMillis = requireNotNull(instant(o.optStringOrNull("departs_at"))),
      gate = o.optStringOrNull("gate"),
      status = o.optString("status"),
      delayMin = if (o.isNull("delay_min") || !o.has("delay_min")) null else o.getInt("delay_min"),
    )

    private fun leaveBy(o: JSONObject) = LeaveBy(
      title = o.getString("title"),
      placeName = o.optStringOrNull("place_name"),
      leaveAtMillis = requireNotNull(instant(o.optStringOrNull("leave_at"))),
    )

    private fun instant(value: String?): Long? =
      value?.let { runCatching { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull() }
        ?: value?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
  }
}

internal fun JSONObject.optStringOrNull(key: String): String? =
  if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }

internal fun JSONArray?.objects(): List<JSONObject> =
  if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

internal fun JSONArray.strings(): List<String> = (0 until length()).mapNotNull { optString(it).takeIf(String::isNotEmpty) }
