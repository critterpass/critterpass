package app.critterpass.spikeandroid.widget

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver

/** Registered in the manifest by the config plugin as this widget's `AppWidgetProvider`. */
class AndroidSurfacesWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = AndroidSurfacesWidget()
}
