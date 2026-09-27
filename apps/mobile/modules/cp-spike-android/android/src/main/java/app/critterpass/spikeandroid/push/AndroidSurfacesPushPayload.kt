package app.critterpass.spikeandroid.push

import org.json.JSONException
import org.json.JSONObject

/** `start` begins a Live Update, `update` refreshes it, `end` cancels the notification. */
enum class PushOp {
  START,
  UPDATE,
  END,
}

/**
 * Parsed shape of the `la.<kind>` FCM v1 data message this spike's Live Update surface consumes —
 * mirrors `tools/spikes/src/apns-live-activity/fcm-client.ts`'s `sendLiveActivityDataMessage`
 * payload (`type`, `op`, `state` as a JSON string) so both platforms' spikes speak the same wire
 * shape. `state`'s fields are the minimal set this spike renders, not a full `ProgressSpec`.
 */
data class AndroidSurfacesPushPayload(
  val kind: String,
  val op: PushOp,
  val progress: Int,
  val progressMax: Int,
  val chip: String,
  val metricLabel: String?,
  val metricValue: Float?,
)

class InvalidPushPayloadException(message: String) : Exception(message)

object AndroidSurfacesPushPayloadParser {
  /**
   * `data` is exactly the `Map<String, String>` shape both `RemoteMessage.getData()` (real FCM)
   * and the JS/adb test hooks deliver — the parser has no transport-specific branch, which is the
   * point: whichever caller invokes it exercises the identical logic a real push would.
   */
  fun parse(data: Map<String, String>): AndroidSurfacesPushPayload {
    val type = data["type"]?.takeIf { it.isNotBlank() }
      ?: throw InvalidPushPayloadException("missing \"type\"")
    if (!type.startsWith("la.")) {
      throw InvalidPushPayloadException("unsupported type \"$type\" (expected \"la.<kind>\")")
    }
    val kind = type.removePrefix("la.")

    val op = when (data["op"]) {
      "start" -> PushOp.START
      "update" -> PushOp.UPDATE
      "end" -> PushOp.END
      else -> throw InvalidPushPayloadException("missing or invalid \"op\" (want start/update/end)")
    }

    val stateJson = data["state"] ?: throw InvalidPushPayloadException("missing \"state\"")
    val state = try {
      JSONObject(stateJson)
    } catch (cause: JSONException) {
      throw InvalidPushPayloadException("\"state\" is not valid JSON: ${cause.message}")
    }

    if (!state.has("progress") || !state.has("progressMax") || !state.has("chip")) {
      throw InvalidPushPayloadException("\"state\" must have progress, progressMax and chip")
    }

    return AndroidSurfacesPushPayload(
      kind = kind,
      op = op,
      progress = state.getInt("progress"),
      progressMax = state.getInt("progressMax"),
      chip = state.getString("chip"),
      metricLabel = if (state.has("metricLabel")) state.getString("metricLabel") else null,
      metricValue = if (state.has("metricValue")) state.getDouble("metricValue").toFloat() else null,
    )
  }
}
