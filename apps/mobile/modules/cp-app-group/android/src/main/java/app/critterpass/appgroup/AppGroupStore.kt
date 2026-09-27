package app.critterpass.appgroup

import java.io.File
import java.io.RandomAccessFile
import java.time.Instant
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

/**
 * The Android mirror of the iOS App Group store (api-contracts-async.md §6): the same JSON files
 * under `filesDir/cp-app-group/`, shared by the app, Glance widgets and notification-action
 * receivers. Every read-modify-write holds a process-wide lock plus an exclusive file lock (a
 * receiver may run in another process), and every write lands atomically: a temp file in the same
 * directory renamed over the target.
 */
class AppGroupStore(private val root: File, private val now: () -> Instant = { Instant.now() }) {
  fun write(data: ByteArray, relativePath: String) = locked(relativePath) { file ->
    replaceAtomically(file, data)
  }

  fun read(relativePath: String): ByteArray? = locked(relativePath) { file ->
    if (file.exists()) file.readBytes() else null
  }

  /** Queues one command; extensions call this when `POST /v1/actions` is unreachable. */
  fun appendPendingAction(action: PendingAction) = updatePendingActions { actions ->
    actions.put(action.toJson())
  }

  /** The raw file, or an empty one when nothing was ever queued. */
  fun pendingActionsText(): String =
    read(PENDING_ACTIONS_PATH)?.toString(Charsets.UTF_8) ?: emptyFile().toString()

  /**
   * Removes the entries whose `op_id` is listed (and any entry with no `op_id`, which can never be
   * addressed); anything appended since the caller read the file stays. Returns how many remain.
   */
  fun removePendingActions(opIds: Set<String>): Int {
    var remaining = 0
    updatePendingActions { actions ->
      val kept = JSONArray()
      for (index in 0 until actions.length()) {
        val entry = actions.optJSONObject(index) ?: continue
        val opId = entry.optString("op_id", "")
        if (opId.isNotEmpty() && opId !in opIds) kept.put(entry)
      }
      remaining = kept.length()
      kept
    }
    return remaining
  }

  /** Account switch: nothing the previous user queued may be sent as the next one. */
  fun clearPendingActions() = updatePendingActions { JSONArray() }

  /** A file written by a newer schema is left untouched rather than rewritten. */
  private fun updatePendingActions(change: (JSONArray) -> JSONArray) =
    locked(PENDING_ACTIONS_PATH) { file ->
      val content = if (file.exists()) JSONObject(file.readText(Charsets.UTF_8)) else emptyFile()
      if (content.optInt("schema", -1) != PendingActionsFile.SCHEMA_VALUE) {
        throw UnsupportedSchemaException(PENDING_ACTIONS_PATH)
      }
      content.put("actions", change(content.optJSONArray("actions") ?: JSONArray()))
      content.put("generated_at", now().toString())
      replaceAtomically(file, content.toString().toByteArray(Charsets.UTF_8))
    }

  private fun emptyFile(): JSONObject =
    JSONObject()
      .put("schema", PendingActionsFile.SCHEMA_VALUE)
      .put("generated_at", now().toString())
      .put("actions", JSONArray())

  private fun <T> locked(relativePath: String, body: (File) -> T): T {
    val file = File(root, relativePath)
    file.parentFile?.mkdirs()
    synchronized(PROCESS_LOCK) {
      RandomAccessFile(File(file.parentFile, ".${file.name}.lock"), "rw").use { lockFile ->
        lockFile.channel.lock().use { return body(file) }
      }
    }
  }

  private fun replaceAtomically(file: File, data: ByteArray) {
    val temp = File(file.parentFile, ".${file.name}.${UUID.randomUUID()}.tmp")
    try {
      temp.writeBytes(data)
      if (!temp.renameTo(file)) throw WriteFailedException(file.name)
    } finally {
      temp.delete()
    }
  }

  companion object {
    const val ROOT_DIR = "cp-app-group"
    const val PENDING_ACTIONS_PATH = "state/pending-actions.json"
    const val ENDPOINTS_PATH = "config/endpoints.json"

    private val PROCESS_LOCK = Any()

    fun inFilesDir(filesDir: File) = AppGroupStore(File(filesDir, ROOT_DIR))
  }
}

class UnsupportedSchemaException(path: String) :
  IllegalStateException("$path was written with an unsupported schema")

class WriteFailedException(path: String) : IllegalStateException("replacing $path failed")
