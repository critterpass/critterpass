package app.critterpass.appgroup

import android.content.Intent
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.time.Instant
import java.util.Base64
import java.util.UUID

/**
 * Android has no App Group; Glance widgets run in this app's own process, so "shared storage" is
 * just an app-private directory (api-contracts-async.md §6, Android mirror). `reloadWidgets`
 * cannot reference a concrete Glance widget class here without coupling this spike module to the
 * Android surfaces phase's widget code, so it sends a broadcast that widget receiver(s) listen
 * for and update themselves from.
 */
class CpAppGroupModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CpAppGroup")

    Function("writeSnapshot") { key: String, json: String ->
      AppGroupFiles.writeAtomic(context, json.toByteArray(Charsets.UTF_8), "snapshot/$key.json")
    }

    Function("writeImage") { key: String, pngBase64: String ->
      val bytes = try {
        Base64.getDecoder().decode(pngBase64)
      } catch (error: IllegalArgumentException) {
        throw InvalidBase64Exception(error)
      }
      AppGroupFiles.writeAtomic(context, bytes, "assets/$key.png")
    }

    Function("readOutbox") {
      AppGroupFiles.readString(context, "state/pending-actions.json")
        ?: """{"schema":1,"generated_at":"${Instant.now()}","actions":[]}"""
    }

    Function("reloadWidgets") {
      context.sendBroadcast(Intent(ACTION_RELOAD_WIDGETS).setPackage(context.packageName))
    }
  }

  private val context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  companion object {
    /** T14 (Android surfaces) registers a receiver for this to refresh its Glance widget(s). */
    const val ACTION_RELOAD_WIDGETS = "app.critterpass.appgroup.RELOAD_WIDGETS"
  }
}

private class InvalidBase64Exception(cause: Throwable) :
  CodedException("pngBase64 is not valid base64 data", cause)

private class WriteFailedException(path: String, cause: Throwable) :
  CodedException("Failed writing to $path", cause)

/** Minimal atomic file I/O against `filesDir/cp-app-group/`. */
private object AppGroupFiles {
  private const val ROOT_DIR = "cp-app-group"

  fun writeAtomic(context: android.content.Context, data: ByteArray, relativePath: String) {
    val file = resolve(context, relativePath)
    file.parentFile?.mkdirs()
    val tempFile = File(file.parentFile, "${file.name}.tmp-${UUID.randomUUID()}")
    try {
      tempFile.writeBytes(data)
      if (!tempFile.renameTo(file)) {
        throw IllegalStateException("renameTo returned false")
      }
    } catch (error: Exception) {
      tempFile.delete()
      throw WriteFailedException(relativePath, error)
    }
  }

  fun readString(context: android.content.Context, relativePath: String): String? {
    val file = resolve(context, relativePath)
    return if (file.exists()) file.readText(Charsets.UTF_8) else null
  }

  private fun resolve(context: android.content.Context, relativePath: String): File =
    File(File(context.filesDir, ROOT_DIR), relativePath)
}
