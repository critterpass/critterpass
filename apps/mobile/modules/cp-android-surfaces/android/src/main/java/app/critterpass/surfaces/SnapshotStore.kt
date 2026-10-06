package app.critterpass.surfaces

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import app.critterpass.appgroup.AppGroupStore
import app.critterpass.surfaces.widgets.WidgetSnapshot
import java.io.File
import org.json.JSONObject

/**
 * The Android mirror of the App Group snapshot (api-contracts-async.md §6): the app writes
 * `snapshot/widgets.json` and the art under `assets/` through cp-app-group's store in `filesDir`,
 * and every surface here (Glance widgets, the dream, the vote poster) reads that one copy, so
 * Android and iOS widgets draw the same data. Reads never throw: a missing or unreadable file is
 * the empty state.
 */
object SnapshotStore {
  const val WIDGETS_PATH = "snapshot/widgets.json"

  fun widgets(context: Context): WidgetSnapshot? {
    val raw = store(context).read(WIDGETS_PATH) ?: return null
    return runCatching { WidgetSnapshot.parse(JSONObject(String(raw, Charsets.UTF_8))) }.getOrNull()
  }

  /** A baked PNG by App Group key (`critters/tokek-hop-day`), or null when the app has not copied it. */
  fun image(context: Context, key: String): Bitmap? {
    if (key.isEmpty() || key.contains("..")) return null
    val file = File(context.filesDir, "${AppGroupStore.ROOT_DIR}/assets/$key.png")
    return if (file.isFile) BitmapFactory.decodeFile(file.path) else null
  }

  private fun store(context: Context) = AppGroupStore.inFilesDir(context.applicationContext.filesDir)
}
