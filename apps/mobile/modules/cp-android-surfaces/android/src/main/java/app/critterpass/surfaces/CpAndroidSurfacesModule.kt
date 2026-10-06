package app.critterpass.surfaces

import android.content.Context
import app.critterpass.surfaces.actions.ActionKeyStore
import app.critterpass.surfaces.actions.ActionWorker
import app.critterpass.surfaces.hub.KeyguardProbe
import app.critterpass.surfaces.hub.PinWidget
import app.critterpass.surfaces.permissions.SurfacePermissions
import app.critterpass.surfaces.widgets.WidgetRefresh
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JS side of the Android surfaces: hands the device action key to the Keystore, asks for an
 * outbox drain, reports the permission state the surfaces depend on with the settings pages that
 * grant it, and pins and lists widgets. Everything else (Live Updates, actions, widgets) runs
 * without JS.
 */
class CpAndroidSurfacesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CpAndroidSurfaces")

    // The application listener normally installed these already; a host without it still gets them.
    OnCreate { appContext.reactContext?.let(SurfacesSetup::install) }

    AsyncFunction("importActionKey") { json: String -> ActionKeyStore(context).import(json) }

    Function("revokeActionKey") { ActionKeyStore(context).revoke() }

    Function("actionKeyInfo") {
      val store = ActionKeyStore(context)
      store.meta()?.let { meta ->
        mapOf(
          "keyId" to meta.keyId,
          "scopes" to meta.scopes.sorted(),
          "expiresAtMs" to meta.expiresAtMillis.toDouble(),
          "secureHardware" to store.isInsideSecureHardware(),
        )
      }
    }

    Function("drainActions") { ActionWorker.schedule(context) }

    Function("permissionState") { SurfacePermissions.report(context) }

    Function("openSettings") { banner: String, channelId: String? -> SurfacePermissions.openSettings(context, banner, channelId) }

    Function("channelImportance") { channelId: String -> SurfacePermissions.channelImportance(context, channelId) }

    Function("widgetSupport") {
      mapOf("pin" to PinWidget.supported(context), "keyguard" to KeyguardProbe.supported(context), "dream" to true)
    }

    Function("requestPinWidget") { kind: String -> PinWidget.request(context, kind) }

    Function("installedWidgets") { WidgetRefresh.installed(context) }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }
}
