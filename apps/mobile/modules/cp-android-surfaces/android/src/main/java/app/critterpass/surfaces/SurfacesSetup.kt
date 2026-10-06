package app.critterpass.surfaces

import android.content.Context
import androidx.core.app.NotificationCompat
import app.critterpass.notifications.CpMessagingService
import app.critterpass.notifications.NotificationTap
import app.critterpass.notifications.SenderMessage
import app.critterpass.surfaces.actions.ActionButtons
import app.critterpass.surfaces.actions.ActionTarget
import app.critterpass.surfaces.actions.Categories
import app.critterpass.surfaces.liveupdate.LiveUpdateRenderer
import app.critterpass.surfaces.sos.SosChannel
import app.critterpass.surfaces.vote.VotePosterNotification
import app.critterpass.surfaces.widgets.WidgetRefresh
import org.json.JSONObject

/**
 * Registers the surfaces with cp-notifications' messaging service, once per process: Live
 * Activity steps, widget refreshes, the vote poster and SOS pushes are drawn here; every other
 * category keeps cp-notifications' sender rendering and gets its buttons from [Categories].
 */
object SurfacesSetup {
  @Volatile private var installed = false

  /** Categories whose buttons come from the table (the vote has its own poster). */
  private val BUTTON_CATEGORIES = listOf(
    "cp.changeset", "cp.disruption", "cp.leaveby", "cp.sos", "cp.money", "cp.chat",
    "cp.rsvp", "cp.invite", "cp.help", "cp.setup_ask", "cp.generic",
  )

  @Synchronized
  fun install(context: Context) {
    if (installed) return
    installed = true
    val app = context.applicationContext
    SosChannel.ensure(app)
    CpMessagingService.dataHandlers += { ctx, data -> LiveUpdateRenderer.handle(ctx, data) }
    CpMessagingService.dataHandlers += { ctx, data -> WidgetRefresh.handle(ctx, data) }
    CpMessagingService.dataHandlers += { ctx, data -> VotePosterNotification.post(ctx, data) }
    CpMessagingService.dataHandlers += { ctx, data -> SosChannel.handle(ctx, data) }
    BUTTON_CATEGORIES.forEach { category -> CpMessagingService.actionProviders[category] = ::buttons }
  }

  private fun buttons(context: Context, message: SenderMessage, data: Map<String, String>): List<NotificationCompat.Action> {
    val ctx = data["cp"]?.let { runCatching { JSONObject(it).optJSONObject("ctx") }.getOrNull() }
    val tag = (if (message.appendsToConversation) message.conversationId else message.nid) ?: message.nid
    val tap = NotificationTap(message.nid, message.deeplink, message.type, message.crewId)
    val target = ActionTarget(message.category, tag, CP_NOTIFICATION_ID, "notif_action", tap)
    return Categories.actions(message.category, ctx).map { ActionButtons.compat(context, it, target) }
  }

  /** cp-notifications posts every sender notification under this id (tagged per push). */
  private const val CP_NOTIFICATION_ID = 1
}
