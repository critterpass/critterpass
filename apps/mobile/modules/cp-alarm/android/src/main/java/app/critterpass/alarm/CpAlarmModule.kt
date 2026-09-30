package app.critterpass.alarm

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.interfaces.permissions.PermissionsResponse
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The leave-by alarm on Android (modules/cp-alarm/index.ts). "Authorized" means the alarm can
 * reach the user at all, which on Android is notification permission; how precisely it rings is
 * the engine in [capabilities]. Taps on the ringing alarm are queued in the App Group outbox and
 * relayed here as `onAlarmAction`.
 */
class CpAlarmModule : Module() {
  private val listener: (Map<String, Any>) -> Unit = { event -> sendEvent("onAlarmAction", event) }

  override fun definition() = ModuleDefinition {
    Name("CpAlarm")

    Events("onAlarmAction")

    OnStartObserving { AlarmEvents.attach(listener) }

    OnStopObserving { AlarmEvents.detach() }

    Function("capabilities") {
      mapOf(
        "engine" to AlarmPlan.engine(AlarmScheduler.canScheduleExactAlarms(context)).wire,
        "fullScreenIntent" to AlarmScheduler.canUseFullScreenIntent(context),
      )
    }

    Function("authorizationStatus") { authorization(asked = false) }

    AsyncFunction("requestAuthorization") { promise: Promise ->
      if (NotificationManagerCompat.from(context).areNotificationsEnabled() ||
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
      ) {
        promise.resolve(authorization(asked = true))
        return@AsyncFunction
      }
      val permissions = appContext.permissions
      if (permissions == null) {
        promise.resolve(authorization(asked = true))
        return@AsyncFunction
      }
      permissions.askForPermissions(
        { _: Map<String, PermissionsResponse> -> promise.resolve(authorization(asked = true)) },
        Manifest.permission.POST_NOTIFICATIONS,
      )
    }

    AsyncFunction("schedule") { request: Map<String, Any?> ->
      val parsed =
        try {
          AlarmRequest.fromMap(request).also { it.validate(System.currentTimeMillis()) }
        } catch (error: Exception) {
          throw CodedException("ERR_ALARM_REQUEST", error.message ?: "Malformed alarm request", error)
        }
      AlarmScheduler.schedule(context, parsed).toWire()
    }

    AsyncFunction("cancel") { leaveById: String -> AlarmScheduler.cancel(context, leaveById) }

    AsyncFunction("list") { AlarmScheduler.store(context).all().map { it.toWire() } }

    AsyncFunction("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction false
      val intent =
        Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      runCatching { context.startActivity(intent) }.isSuccess
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  /** Before the first ask on Android 13+, a disabled notification state is "not determined". */
  private fun authorization(asked: Boolean): String {
    if (NotificationManagerCompat.from(context).areNotificationsEnabled()) return "authorized"
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "denied"
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (asked) prefs.edit().putBoolean(ASKED_KEY, true).apply()
    return if (prefs.getBoolean(ASKED_KEY, false)) "denied" else "notDetermined"
  }

  private companion object {
    const val PREFS = "cp_alarm"
    const val ASKED_KEY = "notifications_asked"
  }
}
