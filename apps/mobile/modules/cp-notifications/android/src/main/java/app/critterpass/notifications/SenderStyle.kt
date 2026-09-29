package app.critterpass.notifications

import org.json.JSONObject

/** Who a notification comes from (the `cp.sender` block): a guide persona or a crewmate. */
data class NotificationSender(
  val kind: String,
  val id: String,
  val name: String,
  /** Guide personas always carry the AI disclosure ("Tokek · AI guide"). */
  val displayName: String,
  /** `cp-guide:<guide_id>` or `cp-user:<uid>`: the stable key of the `Person`. */
  val personKey: String,
  /** An App Group avatar key (`guide-tokek`) or an https URL. */
  val avatar: String?,
) {
  val isGuide: Boolean get() = kind == KIND_GUIDE
}

/** A data-only FCM message decoded into what the tray shows (docs/api-contracts-async.md §3.3). */
data class SenderMessage(
  val nid: String,
  val type: String,
  val channelId: String,
  val category: String?,
  val title: String,
  val body: String,
  val subtitle: String?,
  val deeplink: String?,
  val crewId: String?,
  /** Null for system notifications (billing, account): they stay plain alerts. */
  val sender: NotificationSender?,
  /** The crew id, `guide:<guide_id>[:<uid>]` or `user:<uid>`; null without a sender. */
  val conversationId: String?,
  /** The conversation's title for crew threads (the crew's name); null for one-to-one threads. */
  val conversationTitle: String?,
  /** Tray group: the push's thread id, else its crew. */
  val groupKey: String?,
) {
  val isGroupConversation: Boolean get() = crewId != null && sender != null

  /** Chat messages stack into one notification per conversation; everything else stands alone. */
  val appendsToConversation: Boolean get() = type == CREW_CHAT_TYPE && conversationId != null
}

const val KIND_GUIDE = "guide"
const val KIND_MEMBER = "member"
const val KIND_SYSTEM = "system"
const val CREW_CHAT_TYPE = "crew_chat"

/**
 * Builds the sender identity of a CritterPass push, the Android counterpart of the iOS
 * notification service extension's `SenderIdentity`: same person keys, same conversation ids, so a
 * crew thread is one conversation on both platforms. Pure: no Android types, tested on fixtures.
 */
object SenderStyle {
  /** The English guide name format; the service passes the localised string resource. */
  const val DEFAULT_GUIDE_FORMAT = "%1\$s · AI guide"

  /**
   * Null when [data] is not a CritterPass notification (no `cp` block, no title or body), so the
   * caller hands it to expo-notifications instead.
   */
  fun parse(
    data: Map<String, String>,
    recipientUserId: String? = null,
    guideNameFormat: String = DEFAULT_GUIDE_FORMAT,
  ): SenderMessage? {
    val cp = data["cp"]?.let { raw -> runCatching { JSONObject(raw) }.getOrNull() } ?: return null
    val nid = cp.optNonBlank("nid") ?: data["nid"]?.takeIf { it.isNotBlank() } ?: return null
    val title = data["title"]?.takeIf { it.isNotBlank() } ?: return null
    val body = data["body"]?.takeIf { it.isNotBlank() } ?: return null
    val crewId = cp.optNonBlank("crew_id")
    val sender = cp.optJSONObject("sender")?.let { senderOf(it, guideNameFormat) }
    val conversationId = sender?.let { conversationIdOf(it, crewId, recipientUserId) }
    return SenderMessage(
      nid = nid,
      type = cp.optNonBlank("type") ?: data["type"].orEmpty(),
      channelId = Channels.resolve(data["channel_id"]),
      category = data["category"]?.takeIf { it.isNotBlank() },
      title = title,
      body = body,
      subtitle = data["subtitle"]?.takeIf { it.isNotBlank() },
      deeplink = cp.optNonBlank("deeplink"),
      crewId = crewId,
      sender = sender,
      conversationId = conversationId,
      conversationTitle = if (sender != null && crewId != null) crewTitle(title, sender) else null,
      groupKey = data["thread_id"]?.takeIf { it.isNotBlank() } ?: crewId,
    )
  }

  private fun senderOf(json: JSONObject, guideNameFormat: String): NotificationSender? {
    val kind = json.optNonBlank("kind") ?: return null
    if (kind == KIND_SYSTEM) return null
    val id = json.optNonBlank("id") ?: return null
    val name = json.optNonBlank("name") ?: return null
    return when (kind) {
      KIND_GUIDE -> NotificationSender(
        kind, id, name, guideNameFormat.format(name), "cp-guide:$id", json.optNonBlank("avatar"),
      )
      KIND_MEMBER -> NotificationSender(
        kind, id, name, name, "cp-user:$id", json.optNonBlank("avatar"),
      )
      else -> null
    }
  }

  fun conversationIdOf(sender: NotificationSender, crewId: String?, recipientUserId: String?): String =
    when {
      crewId != null -> crewId
      sender.isGuide -> listOfNotNull("guide", sender.id, recipientUserId).joinToString(":")
      else -> "user:${sender.id}"
    }

  /**
   * Crew pushes are titled "<sender> · <crew>" (the worker's template); the conversation title is
   * the crew part. A title in any other shape is kept whole.
   */
  fun crewTitle(title: String, sender: NotificationSender): String {
    val prefix = "${sender.name} · "
    return if (title.startsWith(prefix) && title.length > prefix.length) {
      title.removePrefix(prefix)
    } else {
      title
    }
  }

  private fun JSONObject.optNonBlank(key: String): String? =
    if (has(key) && !isNull(key)) optString(key).takeIf { it.isNotBlank() } else null
}
