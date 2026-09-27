package app.critterpass.spikeandroid.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Listens for `cp-app-group`'s `reloadWidgets()` broadcast (`CpAppGroupModule.kt`:
 * `app.critterpass.appgroup.RELOAD_WIDGETS`, duplicated as a literal here rather than a
 * cross-module Gradle dependency between two throwaway spike modules — same call this ADR's
 * sibling `cp-app-group` ADR made for its own iOS/Android duplication, for the same reason:
 * neither module should couple to the other's build graph for a spike). `updateAll` is a suspend
 * call, so this uses `goAsync()` + a background coroutine rather than blocking `onReceive`.
 */
class ReloadWidgetsBroadcastReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_RELOAD_WIDGETS) return
    val appContext = context.applicationContext
    val pendingResult = goAsync()
    CoroutineScope(Dispatchers.Default).launch {
      try {
        AndroidSurfacesWidget().updateAll(appContext)
      } finally {
        pendingResult.finish()
      }
    }
  }

  companion object {
    const val ACTION_RELOAD_WIDGETS = "app.critterpass.appgroup.RELOAD_WIDGETS"
  }
}
