package app.critterpass.appgroup

import android.content.Intent
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Base64

/**
 * Android has no App Group; Glance widgets and notification-action receivers share this app's
 * `filesDir`, so the store (./AppGroupStore.kt) keeps the same JSON files there
 * (api-contracts-async.md §6, Android mirror). `reloadWidgets` sends a broadcast the widget
 * receivers listen for, rather than coupling this module to concrete Glance widget classes.
 */
class CpAppGroupModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CpAppGroup")

    Function("writeSnapshot") { key: String, json: String ->
      store.write(json.toByteArray(Charsets.UTF_8), "snapshot/$key.json")
    }

    Function("writeImage") { key: String, pngBase64: String ->
      val bytes = try {
        Base64.getDecoder().decode(pngBase64)
      } catch (error: IllegalArgumentException) {
        throw InvalidBase64Exception(error)
      }
      store.write(bytes, "assets/$key.png")
    }

    Function("writeEndpointsConfig") { json: String ->
      store.write(json.toByteArray(Charsets.UTF_8), AppGroupStore.ENDPOINTS_PATH)
    }

    Function("readOutbox") { store.pendingActionsText() }

    Function("removeOutboxActions") { opIds: List<String> ->
      store.removePendingActions(opIds.toSet())
    }

    Function("clearOutbox") { store.clearPendingActions() }

    Function("reloadWidgets") {
      context.sendBroadcast(Intent(ACTION_RELOAD_WIDGETS).setPackage(context.packageName))
    }
  }

  private val context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  private val store
    get() = AppGroupStore.inFilesDir(context.filesDir)

  companion object {
    /** The Android widget receivers listen for this to refresh their Glance widgets. */
    const val ACTION_RELOAD_WIDGETS = "app.critterpass.appgroup.RELOAD_WIDGETS"
  }
}

private class InvalidBase64Exception(cause: Throwable) :
  CodedException("pngBase64 is not valid base64 data", cause)
