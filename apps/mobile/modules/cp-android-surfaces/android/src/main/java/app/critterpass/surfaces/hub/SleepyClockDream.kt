package app.critterpass.surfaces.hub

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.service.dreams.DreamService
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import app.critterpass.surfaces.R
import app.critterpass.surfaces.SnapshotStore
import java.util.Date

/**
 * The "sleepy clock" (5c-4) as a screen saver: Tokek breathing on a dark screen with the next
 * leave-by time, or the clock when none is set. Android only runs screen savers while charging or
 * docked, and the system settings list it with that in its name.
 */
class SleepyClockDream : DreamService() {
  private val handler = Handler(Looper.getMainLooper())
  private var breathing: ObjectAnimator? = null
  private lateinit var time: TextView
  private lateinit var caption: TextView

  private val tick = object : Runnable {
    override fun run() {
      render()
      handler.postDelayed(this, 30_000)
    }
  }

  @SuppressLint("DiscouragedApi")
  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    isInteractive = false
    isFullscreen = true
    isScreenBright = false
    val tokek = ImageView(this).apply {
      val art = resources.getIdentifier("critter_gecko_common_sleep_color_96pt", "drawable", packageName)
      if (art != 0) setImageResource(art)
    }
    time = text(56f, Color.parseColor("#F4EFE4"))
    caption = text(16f, Color.parseColor("#A9A3C0"))
    setContentView(
      LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setBackgroundColor(Color.parseColor("#0B0A12"))
        addView(tokek, LinearLayout.LayoutParams(dp(120), dp(120)))
        addView(time)
        addView(caption)
      },
    )
    breathing = ObjectAnimator.ofFloat(tokek, "alpha", 0.55f, 1f).apply {
      duration = 3_000
      repeatMode = ValueAnimator.REVERSE
      repeatCount = ValueAnimator.INFINITE
    }
  }

  override fun onDreamingStarted() {
    super.onDreamingStarted()
    breathing?.start()
    handler.post(tick)
  }

  override fun onDreamingStopped() {
    handler.removeCallbacks(tick)
    breathing?.cancel()
    super.onDreamingStopped()
  }

  private fun render() {
    val leaveBy = SnapshotStore.widgets(this)?.nextLeaveBy?.takeIf { it.leaveAtMillis > System.currentTimeMillis() }
    val format = DateFormat.getTimeFormat(this)
    if (leaveBy != null) {
      time.text = format.format(Date(leaveBy.leaveAtMillis))
      caption.text = getString(R.string.cp_dream_leave_by, leaveBy.title)
    } else {
      time.text = format.format(Date())
      caption.text = getString(R.string.cp_dream_no_leave_by)
    }
  }

  private fun text(size: Float, color: Int) = TextView(this).apply {
    setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
    setTextColor(color)
    gravity = Gravity.CENTER
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
