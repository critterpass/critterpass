package app.critterpass.surfaces.liveupdate

import app.critterpass.surfaces.actions.SurfaceAction
import org.json.JSONObject

/**
 * One `la.<kind>` FCM data message (services/worker/src/push/fcm-surfaces.ts): the op, the object,
 * how this device shows it (`surface`), the fallback channel, the spec and the raw ContentState.
 * Pure: the parsing and the buttons are tested off-device.
 */
data class LiveUpdateMessage(
  val kind: String,
  val op: String,
  val refId: String,
  val surface: String?,
  val channelId: String,
  val spec: ProgressSpec?,
  val attributes: JSONObject?,
  val state: JSONObject?,
) {
  /** Notification tag: one notification per object, replaced by every update. */
  val tag: String get() = "la:$kind:$refId"

  val ends: Boolean get() = op == "end"

  val isLiveUpdate: Boolean get() = surface == null || surface == "live_update"

  /**
   * Buttons per kind (the iOS activity's intents): I'M UP on the member's own leave-by; RUNNING
   * LATE and PING ALL on a meet-up the member is part of, ON MY WAY for those not yet in it; COMING
   * on a crewmate's SOS. [tripId] comes from the attributes kept since `start`.
   */
  fun actions(tripId: String?): List<SurfaceAction> {
    val open = SurfaceAction("OPEN", foreground = true)
    return when (kind) {
      "leave_by" -> listOf(
        action("IM_UP", "set_readiness", "readiness", "leave_by_id" to refId, "state" to "up", "source" to "la"),
      )
      "meet_up" -> if (tripId == null) {
        listOf(open)
      } else if (isLiveUpdate) {
        listOf(
          action("LATE_10", "report_running_late", "trip_day", "trip_id" to tripId, "meetup_id" to refId, "minutes" to 10),
          action("PING_ALL", "ping_all", "trip_day", "trip_id" to tripId, "kind" to "ping"),
        )
      } else {
        listOf(action("ON_MY_WAY", "ping_all", "trip_day", "trip_id" to tripId, "kind" to "on_my_way"), open)
      }
      "sos" -> if (isLiveUpdate) {
        listOf(open)
      } else {
        listOf(action("COMING", "respond_sos", "sos", "sos_id" to refId, "state" to "coming"), open)
      }
      else -> listOf(open)
    }
  }

  private fun action(id: String, command: String, scope: String, vararg payload: Pair<String, Any>) =
    SurfaceAction(id, foreground = false, command = command, scope = scope, payload = mapOf(*payload))

  companion object {
    private const val PREFIX = "la."

    /** Null for anything that is not a Live Activity step. */
    fun parse(data: Map<String, String>): LiveUpdateMessage? {
      val type = data["type"] ?: return null
      if (!type.startsWith(PREFIX)) return null
      val refId = data["ref_id"]?.takeIf { it.isNotBlank() } ?: return null
      val op = data["op"]?.takeIf { it == "start" || it == "update" || it == "end" } ?: return null
      return LiveUpdateMessage(
        kind = type.removePrefix(PREFIX),
        op = op,
        refId = refId,
        surface = data["surface"],
        channelId = data["channel_id"]?.takeIf { it.isNotBlank() } ?: DEFAULT_CHANNEL,
        spec = ProgressSpec.parse(data["spec"]),
        attributes = data["attributes"]?.let { runCatching { JSONObject(it) }.getOrNull() },
        state = data["state"]?.let { runCatching { JSONObject(it) }.getOrNull() },
      )
    }

    const val DEFAULT_CHANNEL = "cp_trip"
  }
}
