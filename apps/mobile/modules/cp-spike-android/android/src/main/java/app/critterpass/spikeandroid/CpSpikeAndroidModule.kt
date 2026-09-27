package app.critterpass.spikeandroid

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import app.critterpass.spikeandroid.alarm.AlarmScheduler
import app.critterpass.spikeandroid.alarm.FullScreenIntentGate
import app.critterpass.spikeandroid.push.AndroidSurfacesPushReceiver
import app.critterpass.spikeandroid.push.LiveUpdateNotifier
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS surface for the T14 spike screen (`(dev)/spikes/android-surfaces.tsx`): the FSI/exact-alarm
 * permission checks + settings deep links, alarm scheduling, and the local push-receiver test
 * hook. The Glance widget itself is OS-driven (no JS function needed to render it — only to write
 * the snapshot it reads, which is `cp-app-group`'s job).
 */
class CpSpikeAndroidModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CpSpikeAndroid")

    Function("canUseFullScreenIntent") {
      val osReportsGranted = if (Build.VERSION.SDK_INT >= FullScreenIntentGate.RUNTIME_CHECK_MIN_SDK) {
        notificationManager.canUseFullScreenIntent()
      } else {
        true
      }
      FullScreenIntentGate.decide(Build.VERSION.SDK_INT, osReportsGranted) == FullScreenIntentGate.Decision.GRANTED
    }

    Function("openFullScreenIntentSettings") {
      val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, appPackageUri)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("canScheduleExactAlarms") {
      AlarmScheduler.canScheduleExact(context)
    }

    Function("openExactAlarmSettings") {
      val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, appPackageUri)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("scheduleFullScreenAlarm") { delaySeconds: Int ->
      AlarmScheduler.schedule(context, delaySeconds.toLong())
    }

    Function("cancelFullScreenAlarm") {
      AlarmScheduler.cancel(context)
    }

    Function("simulateLiveUpdatePush") { type: String, op: String, stateJson: String ->
      AndroidSurfacesPushReceiver.handle(context, mapOf("type" to type, "op" to op, "state" to stateJson))
    }

    Function("dismissLiveUpdate") {
      LiveUpdateNotifier.dismiss(context)
    }
  }

  private val context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  private val notificationManager
    get() = context.getSystemService(NotificationManager::class.java)

  private val appPackageUri
    get() = Uri.fromParts("package", context.packageName, null)
}
