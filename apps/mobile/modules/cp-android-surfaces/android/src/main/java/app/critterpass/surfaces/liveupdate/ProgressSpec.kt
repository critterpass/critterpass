package app.critterpass.surfaces.liveupdate

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import app.critterpass.notifications.tokens.CpPremium
import org.json.JSONObject

/**
 * The Android Live Update contract (packages/domain/src/surfaces/android-live-update.ts
 * `progressSpecSchema`), decoded from the `spec` field of an `la.<kind>` FCM data message.
 */
data class ProgressSpec(
  val metricStyle: Boolean,
  val status: String,
  val title: String,
  val segments: List<Segment>,
  val points: List<Point>,
  val progress: Int,
  val indeterminate: Boolean,
  val chip: Chip,
  val metrics: List<Metric>,
) {
  data class Segment(val length: Int, val tone: Tone)

  data class Point(val position: Int, val tone: Tone)

  data class Metric(val key: String, val value: Double, val isMinutes: Boolean)

  sealed interface Chip {
    data class Until(val epochSeconds: Long) : Chip

    data class Minutes(val minutes: Int) : Chip

    data class Count(val count: Int, val of: Int) : Chip

    data class Label(val key: String) : Chip
  }

  /**
   * Colour roles from the premium palette: the reached legs fill sun (the leave-by trail), the
   * legs ahead sit on the to-do track, stops are muted dots, crewmates tangerine, you sky, and an
   * alert pink.
   */
  enum class Tone(private val color: Color) {
    DONE(CpPremium.Accent.sun),
    AHEAD(CpPremium.Light.colorProgressTodo),
    ALERT(CpPremium.Accent.pink),
    STOP(CpPremium.Light.colorMuted),
    MEMBER(CpPremium.Accent.tangerine),
    ME(CpPremium.Accent.sky);

    val argb: Int get() = color.toArgb()

    companion object {
      fun of(wire: String): Tone = entries.firstOrNull { it.name.equals(wire, ignoreCase = true) } ?: AHEAD
    }
  }

  /** The bar's full length. */
  val max: Int get() = segments.sumOf { it.length }

  companion object {
    /** Null for a missing or malformed spec: the renderer then posts the plain fallback. */
    fun parse(raw: String?): ProgressSpec? = raw?.let { runCatching { parse(JSONObject(it)) }.getOrNull() }

    fun parse(json: JSONObject): ProgressSpec {
      val segments = json.getJSONArray("segments").let { array ->
        (0 until array.length()).map { i ->
          val o = array.getJSONObject(i)
          Segment(o.getInt("length"), Tone.of(o.getString("tone")))
        }
      }
      require(segments.isNotEmpty() && segments.all { it.length > 0 })
      val points = json.optJSONArray("points")?.let { array ->
        (0 until array.length()).map { i ->
          val o = array.getJSONObject(i)
          Point(o.getInt("position"), Tone.of(o.getString("tone")))
        }
      }.orEmpty()
      val metrics = json.optJSONArray("metrics")?.let { array ->
        (0 until array.length()).map { i ->
          val o = array.getJSONObject(i)
          Metric(o.getString("key"), o.getDouble("value"), o.optString("unit") == "min")
        }
      }.orEmpty()
      return ProgressSpec(
        metricStyle = json.optString("style") == "metric",
        status = json.getString("status"),
        title = json.optString("title"),
        segments = segments,
        points = points,
        progress = json.getInt("progress"),
        indeterminate = json.optBoolean("indeterminate", false),
        chip = chip(json.getJSONObject("chip")),
        metrics = metrics,
      )
    }

    private fun chip(o: JSONObject): Chip = when {
      o.has("until") -> Chip.Until(o.getLong("until"))
      o.has("min") -> Chip.Minutes(o.getInt("min"))
      o.has("count") -> Chip.Count(o.getInt("count"), o.optInt("of"))
      else -> Chip.Label(o.getString("key"))
    }
  }
}

/** Status-bar chip text (Android allows about seven characters): `12m`, `1h05`, `3/5`, or a label. */
object ChipText {
  fun of(chip: ProgressSpec.Chip, nowMillis: Long, label: (String) -> String): String = when (chip) {
    is ProgressSpec.Chip.Until -> minutes(((chip.epochSeconds * 1000 - nowMillis).coerceAtLeast(0) + 59_999) / 60_000)
    is ProgressSpec.Chip.Minutes -> minutes(chip.minutes.toLong())
    is ProgressSpec.Chip.Count -> "${chip.count}/${chip.of}"
    is ProgressSpec.Chip.Label -> label(chip.key)
  }

  private fun minutes(total: Long): String =
    if (total < 60) "${total}m" else "${total / 60}h${(total % 60).toString().padStart(2, '0')}"
}
