package app.critterpass.notifications

import android.app.Activity
import android.os.Bundle

/**
 * The system notification settings' link into the app ("Additional settings in the app", and
 * "Manage" on a notification's long-press): opens the app's notification settings (`/you/pings`)
 * through the same tap route a notification uses, then gets out of the way.
 */
class NotificationPreferencesActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val tap = NotificationTap(nid = null, deeplink = SETTINGS_ROUTE, type = TAP_TYPE, crewId = null)
    runCatching { startActivity(NotificationTaps.launchIntent(this, tap)) }
    finish()
  }

  private companion object {
    const val SETTINGS_ROUTE = "/you/pings"
    const val TAP_TYPE = "notification_preferences"
  }
}
