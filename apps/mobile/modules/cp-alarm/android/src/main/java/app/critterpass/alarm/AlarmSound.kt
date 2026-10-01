package app.critterpass.alarm

import android.content.Context
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * The full-screen alarm's ring: the device's alarm sound on the alarm stream (it plays in silent
 * mode), looping, with a repeating vibration, until the alarm is answered.
 */
class AlarmSound(private val context: Context) {
  private var ringtone: Ringtone? = null

  fun start() {
    if (ringtone?.isPlaying == true) return
    val uri =
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    ringtone =
      RingtoneManager.getRingtone(context, uri)?.apply {
        audioAttributes =
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) isLooping = true
        play()
      }
    vibrator()?.vibrate(VibrationEffect.createWaveform(PATTERN, 0))
  }

  fun stop() {
    ringtone?.stop()
    ringtone = null
    vibrator()?.cancel()
  }

  private fun vibrator(): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Vibrator::class.java)
    }

  private companion object {
    val PATTERN = longArrayOf(0, 600, 400, 600, 1200)
  }
}
