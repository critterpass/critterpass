package app.critterpass.surfaces.hub

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.os.Handler
import android.os.Looper
import android.service.dreams.DreamService
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.compose.ui.graphics.toArgb
import androidx.core.content.res.ResourcesCompat
import app.critterpass.notifications.R as NotificationsR
import app.critterpass.notifications.tokens.CpPremium
import app.critterpass.surfaces.R
import app.critterpass.surfaces.SnapshotStore
import java.util.Date

/**
 * The sleepy screen saver, StandBy's left panel (6.28): Tokek asleep and breathing in a warm glow
 * on a dark screen with the guide's "z z z", and the next leave-by time in tangerine when one is
 * set. Android only runs screen savers while charging or docked, and the system settings list it
 * with that in its name.
 */
class SleepyClockDream : DreamService() {
  private val handler = Handler(Looper.getMainLooper())
  private var breathing: ObjectAnimator? = null
  private lateinit var leaveBy: TextView

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
    val snore = textView(18f, CpPremium.Accent.sun.copy(alpha = 0.8f).toArgb()).apply {
      text = SNORE
      ResourcesCompat.getFont(this@SleepyClockDream, NotificationsR.font.cp_borel)?.let { typeface = it }
    }
    leaveBy = textView(15f, CpPremium.Accent.tangerine.toArgb()).apply {
      typeface = Typeface.DEFAULT_BOLD
      letterSpacing = 0.06f
    }
    setContentView(
      LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        background = ground()
        addView(tokek, LinearLayout.LayoutParams(dp(170), dp(170)))
        addView(snore)
        addView(leaveBy, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(18) })
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
    val next = SnapshotStore.widgets(this)?.nextLeaveBy?.takeIf { it.leaveAtMillis > System.currentTimeMillis() }
    if (next != null) {
      val at = DateFormat.getTimeFormat(this).format(Date(next.leaveAtMillis))
      leaveBy.text = getString(R.string.cp_dream_leave_by, at).uppercase()
      leaveBy.visibility = View.VISIBLE
    } else {
      leaveBy.visibility = View.GONE
    }
  }

  /** The night ground with the tangerine glow, centred at 50% / 60% and gone by 60% of the width. */
  private fun ground(): LayerDrawable {
    val glow = GradientDrawable().apply {
      setGradientType(GradientDrawable.RADIAL_GRADIENT)
      setColors(intArrayOf(CpPremium.Accent.tangerine.copy(alpha = GLOW_ALPHA).toArgb(), Color.TRANSPARENT))
      setGradientCenter(0.5f, 0.6f)
      setGradientRadius(resources.displayMetrics.widthPixels * 0.6f)
    }
    return LayerDrawable(arrayOf(GradientDrawable().apply { setColor(NIGHT) }, glow))
  }

  private fun textView(size: Float, color: Int) = TextView(this).apply {
    setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
    setTextColor(color)
    gravity = Gravity.CENTER
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private companion object {
    /** 6.28's StandBy ground (#16110c), warmer than the ink palette, so it is not a token. */
    const val NIGHT = 0xFF16110C.toInt()
    const val GLOW_ALPHA = 0.25f
    /** The guide's snore, drawn in Borel; the same in every language. */
    const val SNORE = "z z z"
  }
}
