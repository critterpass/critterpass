package app.critterpass.notifications

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner

/** What a tap on a CritterPass notification (or its conversation shortcut) hands to JS. */
data class NotificationTap(
  val nid: String?,
  val deeplink: String?,
  val type: String?,
  val crewId: String?,
) {
  fun toMap(): Map<String, String?> =
    mapOf("nid" to nid, "deeplink" to deeplink, "type" to type, "crewId" to crewId)
}

/**
 * Taps open the app's launcher activity with the tap in extras; the module reads them from the
 * launch intent (cold start) or `onNewIntent` (warm) and emits them to JS, which routes with
 * expo-router (src/data/push/routing.ts).
 */
object NotificationTaps {
  const val ACTION = "app.critterpass.notifications.TAP"
  private const val EXTRA_NID = "cp_tap_nid"
  private const val EXTRA_DEEPLINK = "cp_tap_deeplink"
  private const val EXTRA_TYPE = "cp_tap_type"
  private const val EXTRA_CREW_ID = "cp_tap_crew_id"

  fun launchIntent(context: Context, tap: NotificationTap): Intent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent().setPackage(context.packageName)
    return launch.apply {
      action = ACTION
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(EXTRA_NID, tap.nid)
      putExtra(EXTRA_DEEPLINK, tap.deeplink)
      putExtra(EXTRA_TYPE, tap.type)
      putExtra(EXTRA_CREW_ID, tap.crewId)
    }
  }

  fun pendingIntent(context: Context, tap: NotificationTap, requestCode: Int): PendingIntent =
    PendingIntent.getActivity(
      context,
      requestCode,
      launchIntent(context, tap),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  /** The tap an intent carries, removing it so a later read of the same intent sees nothing. */
  fun take(intent: Intent?): NotificationTap? {
    if (intent == null || intent.action != ACTION) return null
    val tap = NotificationTap(
      nid = intent.getStringExtra(EXTRA_NID),
      deeplink = intent.getStringExtra(EXTRA_DEEPLINK),
      type = intent.getStringExtra(EXTRA_TYPE),
      crewId = intent.getStringExtra(EXTRA_CREW_ID),
    )
    intent.action = null
    listOf(EXTRA_NID, EXTRA_DEEPLINK, EXTRA_TYPE, EXTRA_CREW_ID).forEach(intent::removeExtra)
    return tap
  }
}

/**
 * The conversation on screen, set by JS on every route change, so a chat push for the thread the
 * user is reading is not shown while the app is in the foreground.
 */
object ForegroundConversation {
  @Volatile
  var active: String? = null

  fun suppresses(conversationId: String?): Boolean {
    if (conversationId == null || conversationId != active) return false
    return ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
  }
}
