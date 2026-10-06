package app.critterpass.appicon

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Switches the launcher icon by enabling one `activity-alias` of MainActivity and disabling the
 * rest (declared by the module's config plugin). Some launchers drop pinned shortcuts when the
 * entry changes; the icon screen warns once.
 */
class CpAppIconModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("CpAppIcon")

    AsyncFunction("isSupported") { aliasNames().isNotEmpty() }

    AsyncFunction("getCurrent") { AppIconAliases.current(states()) }

    Function("bundledNames") { aliasNames().filter { it != AppIconAliases.DEFAULT } }

    AsyncFunction("set") { name: String? ->
      val packageManager = context.packageManager
      for ((alias, enabled) in AppIconAliases.switchPlan(aliasNames(), name)) {
        packageManager.setComponentEnabledSetting(
          ComponentName(context.packageName, AppIconAliases.className(context.packageName, alias)),
          if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED
          else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
          PackageManager.DONT_KILL_APP,
        )
      }
      name
    }
  }

  /** Every icon alias in the manifest, enabled or not. */
  private fun aliasNames(): List<String> {
    val info = context.packageManager.getPackageInfo(
      context.packageName,
      PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS,
    )
    return info.activities.orEmpty().mapNotNull { AppIconAliases.nameOf(context.packageName, it.name) }
  }

  /** Each alias's explicit state; `null` when it still has the manifest default. */
  private fun states(): Map<String, Boolean?> {
    val packageManager = context.packageManager
    return aliasNames().associateWith { alias ->
      when (
        packageManager.getComponentEnabledSetting(
          ComponentName(context.packageName, AppIconAliases.className(context.packageName, alias)),
        )
      ) {
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
        PackageManager.COMPONENT_ENABLED_STATE_DISABLED -> false
        else -> null
      }
    }
  }
}
