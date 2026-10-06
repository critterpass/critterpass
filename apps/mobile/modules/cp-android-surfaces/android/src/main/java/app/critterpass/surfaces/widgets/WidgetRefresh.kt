package app.critterpass.surfaces.widgets

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.json.JSONArray

class CountdownWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = CountdownWidget()
}

class VoteWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = VoteWidget()
}

class TodayWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = TodayWidget()
}

class BalancesWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = BalancesWidget()
}

class CritterdexWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = CritterdexWidget()
}

class CrewWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = CrewWidget()
}

class NextFlightWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = NextFlightWidget()
}

/**
 * Redraws widgets from the current snapshot: on FCM `widget.refresh` (all, or the `kinds` listed)
 * and on cp-app-group's reload broadcast after the app wrote a new snapshot.
 */
object WidgetRefresh {
  /** cp-app-group's `reloadWidgets()` broadcast. */
  const val ACTION_RELOAD_WIDGETS = "app.critterpass.appgroup.RELOAD_WIDGETS"

  private val widgets: Map<WidgetKind, () -> GlanceAppWidget> = mapOf(
    WidgetKind.COUNTDOWN to ::CountdownWidget,
    WidgetKind.VOTE to ::VoteWidget,
    WidgetKind.TODAY to ::TodayWidget,
    WidgetKind.BALANCES to ::BalancesWidget,
    WidgetKind.CRITTERDEX to ::CritterdexWidget,
    WidgetKind.CREW to ::CrewWidget,
    WidgetKind.NEXT_FLIGHT to ::NextFlightWidget,
  )

  val receivers: Map<WidgetKind, Class<out GlanceAppWidgetReceiver>> = mapOf(
    WidgetKind.COUNTDOWN to CountdownWidgetReceiver::class.java,
    WidgetKind.VOTE to VoteWidgetReceiver::class.java,
    WidgetKind.TODAY to TodayWidgetReceiver::class.java,
    WidgetKind.BALANCES to BalancesWidgetReceiver::class.java,
    WidgetKind.CRITTERDEX to CritterdexWidgetReceiver::class.java,
    WidgetKind.CREW to CrewWidgetReceiver::class.java,
    WidgetKind.NEXT_FLIGHT to NextFlightWidgetReceiver::class.java,
  )

  /** Handles `widget.refresh`; false for any other message. Runs inside the FCM service's worker thread. */
  fun handle(context: Context, data: Map<String, String>): Boolean {
    if (data["type"] != "widget.refresh") return false
    val kinds = data["kinds"]?.let { raw ->
      runCatching { JSONArray(raw).let { a -> (0 until a.length()).map { a.getString(it) } } }.getOrNull()
    }
    runBlocking { update(context.applicationContext, kinds) }
    return true
  }

  suspend fun update(context: Context, kinds: List<String>?) {
    widgets
      .filterKeys { kind -> kinds == null || kind.wire in kinds }
      .values
      .forEach { make -> runCatching { make().updateAll(context) } }
  }

  /** Widgets on the home screen, as `sync_installed_widgets` lists them. */
  fun installed(context: Context): List<Map<String, String>> {
    val manager = AppWidgetManager.getInstance(context)
    return receivers.flatMap { (kind, receiver) ->
      manager.getAppWidgetIds(ComponentName(context, receiver)).map { mapOf("kind" to kind.wire, "family" to "android") }
    }
  }
}

/** Listens for cp-app-group's reload broadcast (a new snapshot was written). */
class ReloadWidgetsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != WidgetRefresh.ACTION_RELOAD_WIDGETS) return
    val pending = goAsync()
    CoroutineScope(Dispatchers.Default).launch {
      try {
        WidgetRefresh.update(context.applicationContext, null)
      } finally {
        pending.finish()
      }
    }
  }
}
