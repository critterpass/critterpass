package app.critterpass.spikeandroid.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.provideContent
import androidx.glance.text.Text

/**
 * Glance widget proving the cp-app-group snapshot round-trip on Android (phase-02 "Android
 * surfaces" step 1). Renders the `message` field of whatever `(dev)/spikes/app-group.tsx`'s
 * "Write hello snapshot" button last wrote — a real cross-process (well, cross-file) read, not a
 * hard-coded string.
 */
class AndroidSurfacesWidget : GlanceAppWidget() {
  override suspend fun provideGlance(context: Context, id: GlanceId) {
    val message = HelloSnapshotReader.readMessage(context)
      ?: "No snapshot yet — write one from the app-group spike screen"
    provideContent {
      Text(text = message)
    }
  }
}
