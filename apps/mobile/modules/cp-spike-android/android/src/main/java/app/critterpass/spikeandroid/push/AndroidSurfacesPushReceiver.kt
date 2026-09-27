package app.critterpass.spikeandroid.push

import android.content.Context
import android.util.Log

private const val TAG = "CpSpikeAndroidPush"

/**
 * Single entry point for "a `la.<kind>` data message arrived," shared by the real
 * [AndroidSurfacesMessagingService], the JS test hook (`CpSpikeAndroidModule.simulateLiveUpdatePush`)
 * and the adb-triggered [AndroidSurfacesTestHookReceiver] — all three call the identical parse +
 * notify path; only the transport differs, so exercising it from JS or adb is exercising the real
 * receiver logic, not a stand-in for it.
 */
object AndroidSurfacesPushReceiver {
  fun handle(context: Context, data: Map<String, String>) {
    val payload = try {
      AndroidSurfacesPushPayloadParser.parse(data)
    } catch (error: InvalidPushPayloadException) {
      Log.w(TAG, "dropping malformed la.* push: ${error.message}")
      return
    }
    LiveUpdateNotifier.postOrUpdate(context, payload)
  }
}
