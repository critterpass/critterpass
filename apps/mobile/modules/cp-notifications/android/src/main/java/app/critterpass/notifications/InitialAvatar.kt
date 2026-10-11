package app.critterpass.notifications

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.core.graphics.drawable.IconCompat
import app.critterpass.notifications.tokens.CpPremium

/**
 * A crewmate with no photo: their initial on their crew colour (the push's `sender.tone`), the
 * same face the app and the iOS notification extension draw, instead of the system's initial on a
 * system colour.
 */
object InitialAvatar {
  private const val SIZE_PX = 144

  /** The premium accent for a crew colour; null for a colour this build does not know. */
  fun accent(tone: String?): Color? = when (tone) {
    "yellow" -> CpPremium.Accent.sun
    "orange" -> CpPremium.Accent.tangerine
    "blue" -> CpPremium.Accent.sky
    "pink" -> CpPremium.Accent.pink
    "green" -> CpPremium.Accent.mint
    "cream" -> CpPremium.Accent.neutral
    else -> null
  }

  /** The first character of [name], upper-cased (a whole surrogate pair); null for a blank name. */
  fun initial(name: String): String? {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) return null
    return String(Character.toChars(trimmed.codePointAt(0))).uppercase()
  }

  /** The drawn avatar, or null when the tone or the name gives nothing to draw. */
  fun icon(name: String, tone: String?): IconCompat? {
    val fill = accent(tone) ?: return null
    val letter = initial(name) ?: return null
    val bitmap = Bitmap.createBitmap(SIZE_PX, SIZE_PX, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val half = SIZE_PX / 2f
    canvas.drawCircle(half, half, half, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = fill.toArgb() })
    val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = CpPremium.Light.colorOnAccent.toArgb()
      textSize = SIZE_PX * 0.46f
      textAlign = Paint.Align.CENTER
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    // Centres the glyph box vertically on the disc.
    val baseline = half - (text.descent() + text.ascent()) / 2f
    canvas.drawText(letter, half, baseline, text)
    return IconCompat.createWithBitmap(bitmap)
  }
}
