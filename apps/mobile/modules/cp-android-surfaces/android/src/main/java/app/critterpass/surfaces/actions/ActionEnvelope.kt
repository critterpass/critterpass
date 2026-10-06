package app.critterpass.surfaces.actions

import org.json.JSONObject

/** The non-secret half of the device action key: who it acts as and what it may do. */
data class ActionKeyMeta(
  val keyId: String,
  val scopes: Set<String>,
  val expiresAtMillis: Long,
  val deviceId: String,
  val userId: String,
) {
  fun allows(scope: String, nowMillis: Long): Boolean = scope in scopes && nowMillis < expiresAtMillis
}

/** What one `/v1/actions` answer means for the queued entry. */
enum class ActionOutcome {
  /** Applied (or a duplicate of an applied one): drop it from the outbox. */
  SENT,

  /** The server refused the command itself; the app's drain would hear the same, so drop it. */
  REJECTED,

  /** The key cannot send it (scope, expiry, signature): keep it for the app's session drain. */
  LEAVE_FOR_APP,

  /** Offline, rate limited or a server error: try again later. */
  RETRY,
}

/**
 * The command envelope (api-contracts.md §2.1) for one queued action, and how its answer is read.
 * Pure: org.json only, so the shapes are tested off-device.
 */
object ActionEnvelope {
  const val PATH = "/v1/actions"

  /**
   * [pending] is one `state/pending-actions.json` entry (`op_id`, `cmd`, `v`, `via`, `client_ts`,
   * `payload`, optional `base_version`); the key adds the actor and the device.
   */
  fun build(pending: JSONObject, key: ActionKeyMeta, appVersion: String, tz: String): ByteArray {
    val body = JSONObject()
      .put("op_id", pending.getString("op_id"))
      .put("cmd", pending.getString("cmd"))
      .put("v", pending.optInt("v", 1))
      .put("actor", JSONObject().put("uid", key.userId).put("via", pending.getString("via")))
      .put(
        "device",
        JSONObject().put("id", key.deviceId).put("platform", "android").put("app_version", appVersion).put("tz", tz),
      )
      .put("client_ts", pending.getString("client_ts"))
      .put("payload", pending.optJSONObject("payload") ?: JSONObject())
    if (pending.has("base_version") && !pending.isNull("base_version")) {
      body.put("base_version", pending.get("base_version"))
    }
    return body.toString().toByteArray(Charsets.UTF_8)
  }

  /** [status] is null when the request never got an answer. */
  fun classify(status: Int?, body: String?): ActionOutcome {
    if (status == null) return ActionOutcome.RETRY
    if (status in 200..299) return ActionOutcome.SENT
    val error = body?.let { runCatching { JSONObject(it).optJSONObject("error") }.getOrNull() }
    val code = error?.optString("code", "").orEmpty()
    return when {
      code == "ACTION_KEY_SCOPE" || status == 401 -> ActionOutcome.LEAVE_FOR_APP
      status == 429 || status >= 500 -> ActionOutcome.RETRY
      error?.optBoolean("retryable", false) == true -> ActionOutcome.RETRY
      else -> ActionOutcome.REJECTED
    }
  }
}
