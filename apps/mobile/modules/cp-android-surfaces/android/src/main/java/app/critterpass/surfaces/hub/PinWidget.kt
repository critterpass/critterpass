package app.critterpass.surfaces.hub

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import app.critterpass.surfaces.widgets.WidgetKind
import app.critterpass.surfaces.widgets.WidgetRefresh

/**
 * The widget gallery's "+" (5c-5): asks the launcher to pin a widget. A launcher without pin
 * support answers false and the app shows its how-to sheet instead.
 */
object PinWidget {
  fun supported(context: Context): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported

  fun request(context: Context, kind: String): Boolean {
    if (!supported(context)) return false
    val widget = WidgetKind.entries.firstOrNull { it.wire == kind } ?: return false
    val receiver = WidgetRefresh.receivers[widget] ?: return false
    return AppWidgetManager.getInstance(context).requestPinAppWidget(ComponentName(context, receiver), null, null)
  }
}
