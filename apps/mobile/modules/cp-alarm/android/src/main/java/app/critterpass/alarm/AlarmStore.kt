package app.critterpass.alarm

import app.critterpass.appgroup.AppGroupStore
import app.critterpass.appgroup.PendingAction
import app.critterpass.appgroup.PendingActionScope
import app.critterpass.appgroup.PendingActionVia
import java.security.SecureRandom
import org.json.JSONArray
import org.json.JSONObject

/** One alarm this device set, as `state/alarms.json` keeps it (api-contracts-async.md §6). */
data class StoredAlarm(
  val request: AlarmRequest,
  val osAlarmId: String,
  val engine: AlarmEngine,
  /** `scheduled`, `alerting` or `snoozed` (`NativeScheduledAlarm.state`). */
  val state: String,
) {
  val leaveById: String get() = request.leaveById

  fun toJson(): JSONObject =
    JSONObject()
      .put("leave_by_id", leaveById)
      .put("os_alarm_id", osAlarmId)
      .put("fire_at", request.fireAt)
      .put("engine", engine.wire)
      .put("state", state)
      .put("request", request.toJson())

  /** The module's `NativeScheduledAlarm`. */
  fun toWire(): Map<String, Any> =
    mapOf("leaveById" to leaveById, "osAlarmId" to osAlarmId, "fireAt" to request.fireAt, "state" to state)

  companion object {
    fun fromJson(json: JSONObject) =
      StoredAlarm(
        request = AlarmRequest.fromJson(json.getJSONObject("request")),
        osAlarmId = json.getString("os_alarm_id"),
        engine = AlarmEngine.entries.firstOrNull { it.wire == json.optString("engine") } ?: AlarmEngine.INEXACT,
        state = json.optString("state", "scheduled"),
      )
  }
}

/**
 * `state/alarms.json` in the Android App Group store: the schedule a reboot, a clock change or a
 * snooze sets alarms again from. Written by the module and the alarm receiver.
 */
class AlarmStore(private val store: AppGroupStore, private val now: () -> Long = System::currentTimeMillis) {
  fun all(): List<StoredAlarm> {
    val text = store.read(PATH)?.toString(Charsets.UTF_8) ?: return emptyList()
    val file = JSONObject(text)
    if (file.optInt("schema", -1) != SCHEMA) return emptyList()
    val alarms = file.optJSONArray("alarms") ?: return emptyList()
    return (0 until alarms.length()).mapNotNull { index ->
      alarms.optJSONObject(index)?.let { runCatching { StoredAlarm.fromJson(it) }.getOrNull() }
    }
  }

  fun get(leaveById: String): StoredAlarm? = all().firstOrNull { it.leaveById == leaveById.lowercase() }

  /** Replaces any entry for the same leave-by. */
  fun save(alarm: StoredAlarm) = write(all().filter { it.leaveById != alarm.leaveById } + alarm)

  fun remove(leaveById: String): StoredAlarm? {
    val alarms = all()
    val removed = alarms.firstOrNull { it.leaveById == leaveById.lowercase() } ?: return null
    write(alarms - removed)
    return removed
  }

  private fun write(alarms: List<StoredAlarm>) {
    val file =
      JSONObject()
        .put("schema", SCHEMA)
        .put("generated_at", AlarmRequest.formatMillis(now()))
        .put("alarms", JSONArray(alarms.sortedBy { it.leaveById }.map { it.toJson() }))
    store.write(file.toString().toByteArray(Charsets.UTF_8), PATH)
  }

  companion object {
    const val PATH = "state/alarms.json"
    const val SCHEMA = 1
  }
}

/**
 * The commands the alarm's buttons queue in the App Group outbox (`state/pending-actions.json`),
 * which the app drains into its own upload queue with the same `op_id` and `via`.
 */
object AlarmOutbox {
  /** The alarm rings as a notification (or its full-screen intent). */
  val VIA = PendingActionVia.NOTIF_ACTION

  fun pendingAction(outcome: AlarmOutcome, leaveById: String, nowMillis: Long, opId: String = uuidV7(nowMillis)) =
    if (outcome.action == "up") {
      PendingAction(
        opId = opId,
        cmd = "set_readiness",
        v = PendingAction.V_VALUE,
        via = VIA,
        scope = PendingActionScope.READINESS,
        clientTs = AlarmRequest.formatMillis(nowMillis),
        payload = mapOf("leave_by_id" to leaveById, "state" to "up", "source" to "alarm"),
      )
    } else {
      PendingAction(
        opId = opId,
        cmd = "snooze_leave_by",
        v = PendingAction.V_VALUE,
        via = VIA,
        scope = PendingActionScope.TRIP_DAY,
        clientTs = AlarmRequest.formatMillis(nowMillis),
        payload = mapOf("leave_by_id" to leaveById, "count" to outcome.snoozeCount),
      )
    }

  fun record(store: AppGroupStore, outcome: AlarmOutcome, leaveById: String, nowMillis: Long): PendingAction =
    pendingAction(outcome, leaveById, nowMillis).also { store.appendPendingAction(it) }

  private val random = SecureRandom()

  /** A time-ordered UUIDv7 (RFC 9562): the server only accepts v7 `op_id`s. */
  fun uuidV7(nowMillis: Long): String {
    val bytes = ByteArray(16).also { random.nextBytes(it) }
    for (index in 0 until 6) bytes[index] = (nowMillis ushr (8 * (5 - index))).toByte()
    bytes[6] = ((bytes[6].toInt() and 0x0F) or 0x70).toByte()
    bytes[8] = ((bytes[8].toInt() and 0x3F) or 0x80).toByte()
    val hex = bytes.joinToString("") { "%02x".format(it) }
    return listOf(hex.substring(0, 8), hex.substring(8, 12), hex.substring(12, 16), hex.substring(16, 20), hex.substring(20))
      .joinToString("-")
  }
}
