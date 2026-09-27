package app.critterpass.spikeandroid.alarm

import android.app.Activity
import android.app.NotificationManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

private const val ALARM_NOTIFICATION_ID = 5101

/**
 * Full-screen-intent target (the "Android surfaces" step 4): shown over the lock screen when
 * the OS granted this app the full-screen-intent permission. Plain Views, not Compose — this
 * activity has one static screen and doesn't need the widget's Compose/Glance runtime, so keeping
 * it dependency-free avoids pulling in `activity-compose`/`material3` for a single spike screen.
 */
class AlarmActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
      )
    }

    setContentView(buildContentView())
  }

  private fun buildContentView(): LinearLayout {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.BLACK)
      setPadding(48, 48, 48, 48)
    }

    root.addView(
      TextView(this).apply {
        text = "Leave-by alarm"
        setTextColor(Color.WHITE)
        textSize = 28f
        gravity = Gravity.CENTER
      },
    )

    root.addView(
      Button(this).apply {
        text = "I'M UP"
        setOnClickListener { dismiss() }
      },
    )

    return root
  }

  private fun dismiss() {
    getSystemService(NotificationManager::class.java).cancel(ALARM_NOTIFICATION_ID)
    finish()
  }
}
