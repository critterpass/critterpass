package app.critterpass.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

/** One Android notification channel: its id, the importance it is created with and its copy. */
data class ChannelSpec(
  val id: String,
  val importance: Int,
  val nameRes: Int,
  val descriptionRes: Int,
)

/**
 * The app's notification channels. The ids mirror `ANDROID_CHANNELS` in
 * packages/domain/src/notifications.ts, in the same order; the worker picks one per notification
 * (`channel_id` in the FCM data) and apps/mobile/src/data/push/__tests__/android-channels.test.ts
 * fails when the two lists drift.
 * Importance is only applied when a channel is first created: after that it belongs to the user.
 */
object Channels {
  // Mirrors NotificationManager.IMPORTANCE_*, kept as plain ints so the list is testable off-device.
  private const val HIGH = 4
  private const val DEFAULT = 3
  private const val LOW = 2

  val ALL: List<ChannelSpec> = listOf(
    ChannelSpec("cp_always", HIGH, R.string.cp_channel_always, R.string.cp_channel_always_description),
    ChannelSpec("cp_alarm", HIGH, R.string.cp_channel_alarm, R.string.cp_channel_alarm_description),
    ChannelSpec("cp_crew_chat", HIGH, R.string.cp_channel_crew_chat, R.string.cp_channel_crew_chat_description),
    ChannelSpec("cp_votes", DEFAULT, R.string.cp_channel_votes, R.string.cp_channel_votes_description),
    ChannelSpec("cp_money", DEFAULT, R.string.cp_channel_money, R.string.cp_channel_money_description),
    ChannelSpec("cp_trip", DEFAULT, R.string.cp_channel_trip, R.string.cp_channel_trip_description),
    ChannelSpec("cp_guide", DEFAULT, R.string.cp_channel_guide, R.string.cp_channel_guide_description),
    ChannelSpec("cp_critters", DEFAULT, R.string.cp_channel_critters, R.string.cp_channel_critters_description),
    ChannelSpec("cp_roundup", LOW, R.string.cp_channel_roundup, R.string.cp_channel_roundup_description),
    ChannelSpec("cp_sos", HIGH, R.string.cp_channel_sos, R.string.cp_channel_sos_description),
  )

  /** Where a notification goes when its payload names a channel this build does not know. */
  const val FALLBACK = "cp_trip"

  private val ids: Set<String> = ALL.map { it.id }.toSet()

  fun resolve(channelId: String?): String =
    if (channelId != null && channelId in ids) channelId else FALLBACK

  /** Creates (or renames, after a locale change) every channel. Cheap to call on each start. */
  fun ensure(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.createNotificationChannels(
      ALL.map { spec ->
        NotificationChannel(spec.id, context.getString(spec.nameRes), spec.importance).apply {
          description = context.getString(spec.descriptionRes)
        }
      },
    )
  }
}
