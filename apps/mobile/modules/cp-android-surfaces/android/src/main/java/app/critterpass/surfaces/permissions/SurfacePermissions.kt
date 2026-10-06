package app.critterpass.surfaces.permissions

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import app.critterpass.surfaces.liveupdate.LiveUpdateRenderer
import app.critterpass.surfaces.sos.SosChannel

/**
 * Reads the grants the surfaces depend on (re-read by the app on every resume, since each can
 * change in settings while the app is away) and opens the settings page that grants each one.
 */
object SurfacePermissions {
  fun state(context: Context): SurfacePermissionState {
    val notifications = context.getSystemService(NotificationManager::class.java)
    return SurfacePermissionState(
      sdkInt = Build.VERSION.SDK_INT,
      notifications = NotificationManagerCompat.from(context).areNotificationsEnabled(),
      exactAlarm = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        context.getSystemService(AlarmManager::class.java)?.canScheduleExactAlarms() == true,
      fullScreenIntent = Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
        notifications?.canUseFullScreenIntent() == true,
      promoted = LiveUpdateRenderer.canPromote(context),
      dndAccess = SosChannel.policyAccessGranted(context),
    )
  }

  /** The state, the degrade path of each surface and the rows to offer, for JS. */
  fun report(context: Context): Map<String, Any> {
    SosChannel.ensure(context)
    val state = state(context)
    return mapOf(
      "sdkInt" to state.sdkInt,
      "notifications" to state.notifications,
      "exactAlarm" to state.exactAlarm,
      "fullScreenIntent" to state.fullScreenIntent,
      "promoted" to state.promoted,
      "dndAccess" to state.dndAccess,
      "sosBypassesDnd" to SosChannel.bypassesDnd(context),
      "alarmPath" to DegradeMatrix.alarm(state).name.lowercase(),
      "sosPath" to DegradeMatrix.sos(state).name.lowercase(),
      "liveUpdatePath" to DegradeMatrix.liveUpdates(state).name.lowercase(),
      "banners" to DegradeMatrix.banners(state).map { it.id },
    )
  }

  /** Opens the page that grants [banner]; false when this OS has no such page. */
  fun openSettings(context: Context, banner: String, channelId: String? = null): Boolean {
    val pkg = Uri.parse("package:${context.packageName}")
    val intent = when (banner) {
      "exact_alarm" ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg) else null
      "full_screen_intent" ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg) else null
      "promoted" ->
        if (Build.VERSION.SDK_INT >= 36) {
          Intent(Settings.ACTION_APP_NOTIFICATION_PROMOTION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        } else {
          null
        }
      "dnd_access" -> Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
      "channel" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && channelId != null) {
        Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
          .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
          .putExtra(Settings.EXTRA_CHANNEL_ID, channelId)
      } else {
        null
      }
      "notifications" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      } else {
        null
      }
      else -> null
    } ?: return false
    return runCatching {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    }.getOrDefault(false)
  }

  /** Per-channel importance (0 when blocked), for the ping settings rows. */
  fun channelImportance(context: Context, channelId: String): Int {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return NotificationManager.IMPORTANCE_DEFAULT
    return context.getSystemService(NotificationManager::class.java)?.getNotificationChannel(channelId)?.importance
      ?: NotificationManager.IMPORTANCE_DEFAULT
  }
}
