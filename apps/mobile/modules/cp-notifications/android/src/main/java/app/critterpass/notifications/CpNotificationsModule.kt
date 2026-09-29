package app.critterpass.notifications

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JS side of the messaging service: creates the channels at app start, hands notification taps
 * to JS (`onTap` while running, `takeInitialTap` for the tap that launched the app) and takes the
 * conversation currently on screen for foreground suppression.
 */
class CpNotificationsModule : Module() {
  /** A tap delivered while no JS listener may be attached yet; read once by `takeInitialTap`. */
  @Volatile
  private var pendingTap: NotificationTap? = null

  override fun definition() = ModuleDefinition {
    Name("CpNotifications")
    Events("onTap")

    OnCreate {
      appContext.reactContext?.applicationContext?.let(Channels::ensure)
    }

    Function("takeInitialTap") {
      val tap = pendingTap ?: NotificationTaps.take(appContext.currentActivity?.intent)
      pendingTap = null
      tap?.toMap()
    }

    Function("setActiveConversation") { conversationId: String? ->
      ForegroundConversation.active = conversationId
    }

    OnNewIntent { intent ->
      val tap = NotificationTaps.take(intent) ?: return@OnNewIntent
      pendingTap = tap
      sendEvent("onTap", tap.toMap())
    }
  }
}
