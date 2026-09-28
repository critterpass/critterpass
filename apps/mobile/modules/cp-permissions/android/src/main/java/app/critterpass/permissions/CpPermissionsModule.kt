package app.critterpass.permissions

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.interfaces.permissions.Permissions
import expo.modules.interfaces.permissions.PermissionsResponse
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * One status/request/Settings API for every permission the app primes (the JS orchestrator in
 * src/lib/permissions). Runtime permissions go through Expo's permission service, which tracks
 * "never asked" and "don't ask again"; special app access (exact alarms, full-screen intents,
 * promoted notifications) has no dialog, only a Settings screen, so it reports granted or denied.
 * Statuses are normalized by [StatusMapping].
 */
class CpPermissionsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CpPermissions")

    AsyncFunction("getStatus") { kind: String, promise: Promise ->
      status(kind, ask = false) { promise.resolve(it) }
    }

    AsyncFunction("request") { kind: String, level: String?, promise: Promise ->
      if (kind == "location" && level == "always") {
        requestBackgroundLocation { promise.resolve(it) }
      } else {
        status(kind, ask = true) { promise.resolve(it) }
      }
    }

    AsyncFunction("requestTemporaryFullAccuracy") { _: String, promise: Promise ->
      // Android has no temporary grant: asking fine location again is the upgrade path.
      runtime(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), ask = true) { states ->
        promise.resolve(states.values.first().status == NormalizedStatus.GRANTED)
      }
    }

    Function("getAlarmCapabilities") {
      mapOf("exactAlarm" to canScheduleExactAlarms(), "fullScreenIntent" to canUseFullScreenIntent())
    }

    Function("getLiveActivities") {
      mapOf("enabled" to canPostPromoted(), "frequent" to canPostPromoted())
    }

    Function("openSettings") { target: String ->
      openSettings(target)
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  private val permissions: Permissions
    get() = requireNotNull(appContext.permissions) { "Permissions service is not available" }

  private fun runtime(
    names: Array<String>,
    ask: Boolean,
    done: (Map<String, KindState>) -> Unit,
  ) {
    val listener = { result: Map<String, PermissionsResponse> ->
      done(result.mapValues { (_, r) -> StatusMapping.fromExpo(r.status.status, r.canAskAgain) })
    }
    if (ask) permissions.askForPermissions(listener, *names)
    else permissions.getPermissions(listener, *names)
  }

  private fun status(kind: String, ask: Boolean, done: (Map<String, Any>) -> Unit) {
    when (kind) {
      "notifications" -> notifications(ask, done)
      "alarms" -> {
        if (ask && !canScheduleExactAlarms()) openSettings("exact_alarm")
        done(StatusMapping.specialAccess(canScheduleExactAlarms()).toMap())
      }
      "location" -> location(ask, done)
      "calendar" -> single(Manifest.permission.READ_CALENDAR, ask, done)
      "camera" -> single(Manifest.permission.CAMERA, ask, done)
      // Android speech recognition needs nothing beyond the microphone.
      "microphone", "speech" -> single(Manifest.permission.RECORD_AUDIO, ask, done)
      // MediaStore inserts need no permission since Android 10.
      "photos_add" ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          done(KindState(NormalizedStatus.GRANTED, false).toMap())
        } else {
          single(Manifest.permission.WRITE_EXTERNAL_STORAGE, ask, done)
        }
      "photos_read" -> photos(ask, done)
      "live_activities" ->
        done(
          if (Build.VERSION.SDK_INT >= 36) StatusMapping.specialAccess(canPostPromoted()).toMap()
          else KindState(NormalizedStatus.RESTRICTED, false).toMap(),
        )
      else -> done(KindState(NormalizedStatus.RESTRICTED, false).toMap())
    }
  }

  private fun single(name: String, ask: Boolean, done: (Map<String, Any>) -> Unit) {
    runtime(arrayOf(name), ask) { states -> done(states.getValue(name).toMap()) }
  }

  private fun notifications(ask: Boolean, done: (Map<String, Any>) -> Unit) {
    val enabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      done(StatusMapping.notificationsLegacy(enabled).toMap())
      return
    }
    runtime(arrayOf(Manifest.permission.POST_NOTIFICATIONS), ask) { states ->
      val state = states.getValue(Manifest.permission.POST_NOTIFICATIONS)
      // Granted at runtime but switched off in Settings still means no notifications.
      val effective = if (state.status == NormalizedStatus.GRANTED && !enabled) {
        KindState(NormalizedStatus.DENIED, false)
      } else {
        state
      }
      done(effective.toMap())
    }
  }

  private fun location(ask: Boolean, done: (Map<String, Any>) -> Unit) {
    val fine = Manifest.permission.ACCESS_FINE_LOCATION
    val coarse = Manifest.permission.ACCESS_COARSE_LOCATION
    val background = Manifest.permission.ACCESS_BACKGROUND_LOCATION
    runtime(arrayOf(fine, coarse), ask) { fg ->
      runtime(arrayOf(background), ask = false) { bg ->
        done(StatusMapping.location(fg.getValue(fine), fg.getValue(coarse), bg[background]).toMap())
      }
    }
  }

  /** The separate Always step; the system shows its own Settings page on Android 11+. */
  private fun requestBackgroundLocation(done: (Map<String, Any>) -> Unit) {
    val background = Manifest.permission.ACCESS_BACKGROUND_LOCATION
    runtime(arrayOf(background), ask = true) { _ -> location(ask = false, done) }
  }

  private fun photos(ask: Boolean, done: (Map<String, Any>) -> Unit) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      single(Manifest.permission.READ_EXTERNAL_STORAGE, ask, done)
      return
    }
    val images = Manifest.permission.READ_MEDIA_IMAGES
    val names = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      arrayOf(images, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
    } else {
      arrayOf(images)
    }
    runtime(names, ask) { states ->
      val selected = states[Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED]
      done(StatusMapping.photos(states.getValue(images), selected).toMap())
    }
  }

  private fun canScheduleExactAlarms(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return false
    return alarms.canScheduleExactAlarms()
  }

  private fun canUseFullScreenIntent(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
    val manager = context.getSystemService(NotificationManager::class.java) ?: return false
    return manager.canUseFullScreenIntent()
  }

  private fun canPostPromoted(): Boolean {
    if (Build.VERSION.SDK_INT < 36) return false
    val manager = context.getSystemService(NotificationManager::class.java) ?: return false
    return manager.canPostPromotedNotifications()
  }

  private fun openSettings(target: String): Boolean {
    val pkg = context.packageName
    val intent = when (target) {
      "notifications" ->
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
      "exact_alarm" ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$pkg"))
        } else {
          appDetails(pkg)
        }
      "full_screen_intent" ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$pkg"))
        } else {
          appDetails(pkg)
        }
      else -> appDetails(pkg)
    }
    return try {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    } catch (_: Exception) {
      context.startActivity(appDetails(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    }
  }

  private fun appDetails(pkg: String) =
    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
}
