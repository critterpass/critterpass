package app.critterpass.spikeandroid.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * `adb shell am broadcast -a app.critterpass.spikeandroid.SIMULATE_PUSH --es type la.leaveby
 * --es op start --es state '{"progress":1,"progressMax":4,"chip":"12 min"}'` — an OEM tester can
 * exercise the exact same [AndroidSurfacesPushReceiver] a real FCM push would reach, without
 * Metro or the dev-client UI. Exported deliberately: this is a dev/spike-only component excluded
 * from the production variant along with the rest of `(dev)/spikes` (`check-release-bundle`).
 */
class AndroidSurfacesTestHookReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val type = intent.getStringExtra("type") ?: return
    val op = intent.getStringExtra("op") ?: return
    val state = intent.getStringExtra("state") ?: return
    AndroidSurfacesPushReceiver.handle(context, mapOf("type" to type, "op" to op, "state" to state))
  }

  companion object {
    const val ACTION_SIMULATE_PUSH = "app.critterpass.spikeandroid.SIMULATE_PUSH"
  }
}
