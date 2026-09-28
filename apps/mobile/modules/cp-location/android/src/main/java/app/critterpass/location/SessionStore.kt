package app.critterpass.location

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * What survives the process: whether the trip-day session is on and at which tier, the geofences
 * the OS holds, and region transitions that arrived while nothing listened (the receiver can run
 * with no JS at all). SharedPreferences, app-private.
 */
object SessionStore {
  private const val PREFS = "cp_location"
  private const val KEY_ACTIVE = "active"
  private const val KEY_TIER = "tier"
  private const val KEY_FENCES = "fences"
  private const val KEY_PENDING = "pending"
  private const val PENDING_LIMIT = 100

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun isActive(context: Context): Boolean = prefs(context).getBoolean(KEY_ACTIVE, false)

  fun tier(context: Context): String = prefs(context).getString(KEY_TIER, "balanced") ?: "balanced"

  fun setActive(context: Context, active: Boolean) {
    prefs(context).edit().putBoolean(KEY_ACTIVE, active).apply()
  }

  fun setTier(context: Context, tier: String) {
    prefs(context).edit().putString(KEY_TIER, tier).apply()
  }

  fun fences(context: Context): List<PlannedGeofence> {
    val raw = prefs(context).getString(KEY_FENCES, null) ?: return emptyList()
    val array = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
    return (0 until array.length()).mapNotNull { index ->
      val row = array.optJSONObject(index) ?: return@mapNotNull null
      PlannedGeofence(row.optString("id"), row.optDouble("lat"), row.optDouble("lng"), row.optDouble("radius"))
    }
  }

  fun setFences(context: Context, fences: List<PlannedGeofence>) {
    val array = JSONArray()
    fences.forEach {
      array.put(JSONObject().put("id", it.id).put("lat", it.lat).put("lng", it.lng).put("radius", it.radiusM))
    }
    prefs(context).edit().putString(KEY_FENCES, array.toString()).apply()
  }

  fun holdRegion(context: Context, body: Map<String, Any>) {
    val array = runCatching { JSONArray(prefs(context).getString(KEY_PENDING, "[]")) }.getOrElse { JSONArray() }
    array.put(JSONObject(body))
    while (array.length() > PENDING_LIMIT) array.remove(0)
    prefs(context).edit().putString(KEY_PENDING, array.toString()).apply()
  }

  fun drainRegions(context: Context): List<Map<String, Any>> {
    val array = runCatching { JSONArray(prefs(context).getString(KEY_PENDING, "[]")) }.getOrElse { JSONArray() }
    prefs(context).edit().putString(KEY_PENDING, "[]").apply()
    return (0 until array.length()).mapNotNull { index ->
      val row = array.optJSONObject(index) ?: return@mapNotNull null
      mapOf("id" to row.optString("id"), "event" to row.optString("event"), "at" to row.optDouble("at"))
    }
  }
}

/** Hands fixes and region transitions from the service and receiver to the module's JS events. */
object SessionBus {
  @Volatile private var fixListener: ((Map<String, Any>) -> Unit)? = null
  @Volatile private var regionListener: ((Map<String, Any>) -> Unit)? = null

  fun attach(onFix: (Map<String, Any>) -> Unit, onRegion: (Map<String, Any>) -> Unit) {
    fixListener = onFix
    regionListener = onRegion
  }

  fun detach() {
    fixListener = null
    regionListener = null
  }

  fun fix(body: Map<String, Any>) {
    fixListener?.invoke(body)
  }

  /** Delivered live when JS listens, otherwise held until the engine drains it. */
  fun region(context: Context, body: Map<String, Any>) {
    val listener = regionListener
    if (listener != null) listener(body) else SessionStore.holdRegion(context, body)
  }
}
