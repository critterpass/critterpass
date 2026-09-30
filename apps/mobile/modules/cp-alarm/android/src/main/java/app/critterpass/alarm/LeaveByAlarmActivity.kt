package app.critterpass.alarm

import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.compose.runtime.mutableStateOf

/**
 * The designed full-screen leave-by alarm (5b-3), shown over the lock screen by the alarm
 * notification's full-screen intent. Slide = I'm up; the snooze link is there while the one snooze
 * is unused; a hardware button (volume, back) is a snooze too, and once the snooze is used it only
 * tells the crew ("Crew was pinged").
 */
class LeaveByAlarmActivity : ComponentActivity() {
  private lateinit var sound: AlarmSound
  private val crewPinged = mutableStateOf(false)
  private var answered = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    val leaveById = intent.getStringExtra(AlarmReceiver.EXTRA_LEAVE_BY_ID)
    val stored = leaveById?.let { AlarmScheduler.store(this).get(it) }
    if (stored == null) {
      finish()
      return
    }
    val request = stored.request
    // The notification stays as the ongoing entry, without sounding over this screen's own ring.
    FallbackNotifier.show(this, request, fullScreen = false, silent = true)
    sound = AlarmSound(this).also { it.start() }

    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() = snooze(request.leaveById)
      },
    )

    setContent {
      AlarmScreen(
        request = request,
        crewPinged = crewPinged.value,
        onUp = { up(request.leaveById) },
        onSnooze = { snooze(request.leaveById) },
      )
    }
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    if (keyCode in HARDWARE_DISMISS_KEYS) {
      intent.getStringExtra(AlarmReceiver.EXTRA_LEAVE_BY_ID)?.let { snooze(it) }
      return true
    }
    return super.onKeyDown(keyCode, event)
  }

  override fun onDestroy() {
    if (::sound.isInitialized) sound.stop()
    super.onDestroy()
  }

  private fun up(leaveById: String) {
    if (answered) return
    answered = true
    sound.stop()
    AlarmActions.up(this, leaveById)
    finish()
  }

  private fun snooze(leaveById: String) {
    if (answered) return
    answered = true
    sound.stop()
    val outcome = AlarmActions.snooze(this, leaveById)
    if (outcome != null && outcome.ringAgain == null) {
      // The one snooze was already used: this one reaches the crew instead of ringing again.
      crewPinged.value = true
      Handler(Looper.getMainLooper()).postDelayed({ finish() }, CREW_PINGED_MS)
    } else {
      finish()
    }
  }

  private companion object {
    const val CREW_PINGED_MS = 2_500L
    val HARDWARE_DISMISS_KEYS =
      setOf(KeyEvent.KEYCODE_VOLUME_UP, KeyEvent.KEYCODE_VOLUME_DOWN, KeyEvent.KEYCODE_CAMERA)
  }
}
