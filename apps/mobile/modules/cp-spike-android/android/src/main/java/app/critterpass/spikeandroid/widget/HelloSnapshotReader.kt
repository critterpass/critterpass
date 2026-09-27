package app.critterpass.spikeandroid.widget

import android.content.Context
import org.json.JSONObject
import java.io.File

private const val SNAPSHOT_RELATIVE_PATH = "cp-app-group/snapshot/hello.json"

/**
 * Reads the exact file `cp-app-group`'s `writeSnapshot('hello', …)` writes
 * (`filesDir/cp-app-group/snapshot/hello.json` — `CpAppGroupModule.kt`'s own doc comment: Android
 * has no App Group, so "shared storage" is this app's private files dir). This is the real
 * cross-module read half of "the Glance widget reads the snapshot written via cp-app-group" (T8).
 */
object HelloSnapshotReader {
  fun readMessage(context: Context): String? {
    val file = File(context.filesDir, SNAPSHOT_RELATIVE_PATH)
    if (!file.exists()) return null
    return try {
      JSONObject(file.readText(Charsets.UTF_8)).optString("message").takeIf { it.isNotBlank() }
    } catch (error: Exception) {
      null
    }
  }
}
