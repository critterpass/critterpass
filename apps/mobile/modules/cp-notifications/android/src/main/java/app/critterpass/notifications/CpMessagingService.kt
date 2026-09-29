package app.critterpass.notifications

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.LocusIdCompat
import androidx.core.graphics.drawable.IconCompat
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Renders CritterPass's data-only FCM messages (docs/api-contracts-async.md §3.3) the way iOS's
 * Communication Notifications show them: a `MessagingStyle` notification from a `Person` with the
 * sender's avatar, filed under a long-lived conversation shortcut, grouped per crew, on the channel
 * the worker picked. Anything that is not ours (and token rotation) goes to expo-notifications'
 * service, which this one extends.
 */
class CpMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val message = SenderStyle.parse(
      remoteMessage.data,
      guideNameFormat = getString(R.string.cp_sender_guide_display_name),
    )
    if (message == null) {
      super.onMessageReceived(remoteMessage)
      return
    }
    if (ForegroundConversation.suppresses(message.conversationId)) return
    Channels.ensure(this)
    runCatching { post(this, message) }
  }

  companion object {
    private const val NOTIFICATION_ID = 1
    private const val AVATAR_TIMEOUT_MS = 2_000
    private const val MAX_AVATAR_BYTES = 512 * 1024

    /**
     * Action buttons per notification category. Empty until a feature registers its category's
     * buttons; each provider builds its actions for one message.
     */
    val actionProviders: MutableMap<String, (Context, SenderMessage) -> List<NotificationCompat.Action>> =
      mutableMapOf()

    // Permission is checked through areNotificationsEnabled(), which covers POST_NOTIFICATIONS.
    @SuppressLint("MissingPermission")
    fun post(context: Context, message: SenderMessage) {
      val manager = NotificationManagerCompat.from(context)
      if (!manager.areNotificationsEnabled()) return
      val sender = message.sender
      val icon = sender?.let { loadAvatar(context, it.avatar) }
      val tag = if (message.appendsToConversation) message.conversationId else message.nid
      val tap = NotificationTap(message.nid, message.deeplink, message.type, message.crewId)
      val builder = NotificationCompat.Builder(context, message.channelId)
        .setSmallIcon(R.drawable.cp_notification_icon)
        .setContentTitle(message.title)
        .setContentText(message.body)
        .setAutoCancel(true)
        .setCategory(
          if (sender != null) NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_REMINDER,
        )
        .setContentIntent(NotificationTaps.pendingIntent(context, tap, (tag ?: message.nid).hashCode()))
      message.subtitle?.let { builder.setSubText(it) }
      message.groupKey?.let { builder.setGroup(it) }

      if (sender != null) {
        val person = Person.Builder()
          .setKey(sender.personKey)
          .setName(sender.displayName)
          .setBot(sender.isGuide)
          .apply { icon?.let { setIcon(it) } }
          .build()
        builder.setStyle(messagingStyle(context, manager, tag, message, person))
        ConversationShortcuts.publish(context, message, person, icon)?.let { shortcutId ->
          builder.setShortcutId(shortcutId).setLocusId(LocusIdCompat(shortcutId))
        }
      }
      message.category
        ?.let { actionProviders[it] }
        ?.invoke(context, message)
        ?.forEach(builder::addAction)

      manager.notify(tag, NOTIFICATION_ID, builder.build())
      message.groupKey?.let { postGroupSummary(context, manager, it, message.channelId) }
    }

    /** Continues the conversation's notification for chat; a fresh single-message style otherwise. */
    private fun messagingStyle(
      context: Context,
      manager: NotificationManagerCompat,
      tag: String?,
      message: SenderMessage,
      person: Person,
    ): NotificationCompat.MessagingStyle {
      val previous = if (message.appendsToConversation) {
        manager.activeNotifications
          .firstOrNull { it.tag == tag && it.id == NOTIFICATION_ID }
          ?.let { NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(it.notification) }
      } else {
        null
      }
      val user = Person.Builder().setName(context.getString(R.string.cp_sender_you)).build()
      val style = previous ?: NotificationCompat.MessagingStyle(user)
      style.isGroupConversation = message.isGroupConversation
      if (message.isGroupConversation) style.conversationTitle = message.conversationTitle
      style.addMessage(message.body, System.currentTimeMillis(), person)
      return style
    }

    private fun postGroupSummary(
      context: Context,
      manager: NotificationManagerCompat,
      groupKey: String,
      channelId: String,
    ) {
      val summary = NotificationCompat.Builder(context, channelId)
        .setSmallIcon(R.drawable.cp_notification_icon)
        .setGroup(groupKey)
        .setGroupSummary(true)
        .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
        .setAutoCancel(true)
        .build()
      manager.notify("group:$groupKey", NOTIFICATION_ID, summary)
    }

    /**
     * The sender's face: the app's cached copy (`cp-app-group/assets/avatars/<key>@3x.png`), else an
     * https avatar downloaded within 2 s. Null leaves the system's initial-letter avatar.
     */
    private fun loadAvatar(context: Context, avatar: String?): IconCompat? {
      if (avatar.isNullOrBlank()) return null
      val bitmap = if (avatar.startsWith("https://")) download(avatar) else cached(context, avatar)
      return bitmap?.let(IconCompat::createWithBitmap)
    }

    private fun cached(context: Context, key: String): Bitmap? {
      val name = key.removePrefix("assets/").removePrefix("avatars/")
      if (name.isEmpty() || name.contains("..") || name.contains('/') || name.contains('\\')) return null
      val fileName = if (name.endsWith(".png")) name else "$name@3x.png"
      val file = File(context.filesDir, "cp-app-group/assets/avatars/$fileName")
      return if (file.isFile) BitmapFactory.decodeFile(file.path) else null
    }

    private fun download(url: String): Bitmap? = runCatching {
      val connection = URL(url).openConnection() as HttpURLConnection
      connection.connectTimeout = AVATAR_TIMEOUT_MS
      connection.readTimeout = AVATAR_TIMEOUT_MS
      try {
        if (connection.responseCode !in 200..299) return@runCatching null
        val bytes = connection.inputStream.use(::readBounded) ?: return@runCatching null
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
      } finally {
        connection.disconnect()
      }
    }.getOrNull()

    /** The stream's bytes, or null past [MAX_AVATAR_BYTES]. */
    private fun readBounded(input: InputStream): ByteArray? {
      val out = ByteArrayOutputStream()
      val buffer = ByteArray(16 * 1024)
      while (true) {
        val read = input.read(buffer)
        if (read < 0) return out.toByteArray()
        out.write(buffer, 0, read)
        if (out.size() > MAX_AVATAR_BYTES) return null
      }
    }
  }
}
