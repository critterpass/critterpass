package app.critterpass.surfaces.liveupdate

import android.content.Context
import org.json.JSONObject

/**
 * What a running Live Update keeps between pushes: the attributes sent with `start` (updates
 * leave them out to stay small; the buttons need the trip id) and the last status, so a heads-up
 * alerts only when the status changes. Forgotten on `end`.
 */
class LiveUpdateMemory(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences("cp_live_updates", Context.MODE_PRIVATE)

  fun keepAttributes(tag: String, attributes: JSONObject) {
    prefs.edit().putString("$tag:attributes", attributes.toString()).apply()
  }

  fun attributes(tag: String): JSONObject? =
    prefs.getString("$tag:attributes", null)?.let { runCatching { JSONObject(it) }.getOrNull() }

  fun keepStatus(tag: String, status: String) {
    prefs.edit().putString("$tag:status", status).apply()
  }

  fun status(tag: String): String? = prefs.getString("$tag:status", null)

  fun forget(tag: String) {
    prefs.edit().remove("$tag:attributes").remove("$tag:status").apply()
  }
}
