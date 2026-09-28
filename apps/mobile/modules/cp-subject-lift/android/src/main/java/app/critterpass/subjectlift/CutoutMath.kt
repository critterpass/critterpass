package app.critterpass.subjectlift

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** A pixel rectangle inside an image: `left`/`top` inclusive, `width`×`height` pixels. */
data class PixelBounds(val left: Int, val top: Int, val width: Int, val height: Int)

/** Where the source lands inside the square avatar, in pixels (may overhang when zoomed). */
data class Placement(val left: Double, val top: Double, val width: Double, val height: Double)

/**
 * The pure pixel work behind the subject lift, free of android.graphics so it runs as JVM unit
 * tests: ML Kit's foreground confidence mask becomes the alpha channel, the cut-out is cropped to
 * the subject's bounds, and a photo with no subject is clipped to a circle instead.
 */
object CutoutMath {
  /** Mask confidence at or above this counts as subject when finding its bounds. */
  const val SUBJECT_CONFIDENCE = 0.5f

  /** A "subject" smaller than this share of the photo is noise: the photo takes the circle crop. */
  const val MIN_SUBJECT_SHARE = 0.005

  /** Room kept around a cut-out inside the square so the white sticker outline is not clipped. */
  const val CUTOUT_MARGIN = 0.08

  /** ARGB pixels with alpha taken from the per-pixel confidence (0..1), keeping soft edges. */
  fun maskToAlpha(pixels: IntArray, mask: FloatArray): IntArray {
    require(pixels.size == mask.size) { "mask and pixels differ in size" }
    return IntArray(pixels.size) { i ->
      val alpha = (mask[i].coerceIn(0f, 1f) * 255f).roundToInt()
      (alpha shl 24) or (pixels[i] and 0x00FFFFFF)
    }
  }

  /** The tight box around confident subject pixels; null when there is no real subject. */
  fun subjectBounds(mask: FloatArray, width: Int, height: Int): PixelBounds? {
    var left = width
    var top = height
    var right = -1
    var bottom = -1
    var count = 0
    for (y in 0 until height) {
      for (x in 0 until width) {
        if (mask[y * width + x] >= SUBJECT_CONFIDENCE) {
          count++
          left = min(left, x)
          right = max(right, x)
          top = min(top, y)
          bottom = max(bottom, y)
        }
      }
    }
    if (count == 0 || count < MIN_SUBJECT_SHARE * width * height) return null
    return PixelBounds(left, top, right - left + 1, bottom - top + 1)
  }

  /** The pixels of `bounds` out of an image `width` pixels wide. */
  fun crop(pixels: IntArray, width: Int, bounds: PixelBounds): IntArray {
    val out = IntArray(bounds.width * bounds.height)
    for (row in 0 until bounds.height) {
      System.arraycopy(
        pixels, (bounds.top + row) * width + bounds.left, out, row * bounds.width, bounds.width)
    }
    return out
  }

  /**
   * A cut-out is fitted (contain) inside the outline margin, a photo fills (cover) the circle; both
   * centred, then scaled by `zoom` ≥ 1 around the centre.
   */
  fun placement(width: Double, height: Double, cutout: Boolean, zoom: Double, side: Double): Placement {
    val box = if (cutout) side * (1 - 2 * CUTOUT_MARGIN) else side
    val fit = if (cutout) min(box / width, box / height) else max(box / width, box / height)
    val scale = fit * max(1.0, zoom)
    val w = width * scale
    val h = height * scale
    return Placement((side - w) / 2, (side - h) / 2, w, h)
  }

  /** Clears everything outside the inscribed circle of a `side`×`side` image, with a 1 px soft edge. */
  fun clipToCircle(pixels: IntArray, side: Int) {
    val radius = side / 2.0
    for (y in 0 until side) {
      for (x in 0 until side) {
        val dx = x + 0.5 - radius
        val dy = y + 0.5 - radius
        val coverage = (radius - sqrt(dx * dx + dy * dy) + 0.5).coerceIn(0.0, 1.0)
        if (coverage >= 1.0) continue
        val i = y * side + x
        val alpha = ((pixels[i] ushr 24) * coverage).roundToInt()
        pixels[i] = (alpha shl 24) or (pixels[i] and 0x00FFFFFF)
      }
    }
  }

  /** The upload's checksum as lowercase hex. */
  fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
}
