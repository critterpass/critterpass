package app.critterpass.notifications

import android.content.Context
import androidx.core.app.Person
import androidx.core.content.LocusIdCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat

/**
 * One long-lived dynamic shortcut per conversation (a crew thread or a guide), so Android files the
 * notification under Conversations with the sender's face and lets the user make it a priority
 * conversation. Pushing an existing id refreshes it and counts as usage; the system drops the least
 * used when the app's shortcut limit is reached.
 */
object ConversationShortcuts {
  /** The shortcut id for [message], or null when it has no conversation. Never throws. */
  fun publish(context: Context, message: SenderMessage, person: Person, icon: IconCompat?): String? {
    val conversationId = message.conversationId ?: return null
    val label = message.conversationTitle ?: message.sender?.displayName ?: return null
    val tap = NotificationTap(
      nid = null,
      deeplink = conversationDeeplink(message),
      type = message.type,
      crewId = message.crewId,
    )
    val shortcut = ShortcutInfoCompat.Builder(context, conversationId)
      .setShortLabel(label)
      .setLongLived(true)
      .setLocusId(LocusIdCompat(conversationId))
      .setIntent(NotificationTaps.launchIntent(context, tap))
      .apply {
        if (!message.isGroupConversation) setPerson(person)
        (icon ?: person.icon)?.let { setIcon(it) }
      }
      .build()
    return runCatching {
      ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)
      conversationId
    }.getOrNull()
  }

  /** A crew conversation opens the crew's chat; any other opens what the push pointed at. */
  private fun conversationDeeplink(message: SenderMessage): String? =
    message.crewId?.let { "/crew/$it/chat" } ?: message.deeplink
}
