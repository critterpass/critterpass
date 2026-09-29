package app.critterpass.ocr

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** A grey image, one 0..255 level per pixel, top row first. */
class GreyImage(val width: Int, val height: Int, val pixels: IntArray)

/** A text line's baseline in pixels, top-left origin, from its left end to its right end. */
data class Baseline(val startX: Double, val startY: Double, val endX: Double, val endY: Double)

/** A line box `[x, y, w, h]` normalised 0..1, top-left origin. */
data class LineBox(val x: Double, val y: Double, val w: Double, val h: Double)

/**
 * The raw quality signals, the same math as Swift `OcrSignals` so both platforms report the same
 * numbers for the same photo; the JS side (src/quality.ts) turns them into one named problem.
 */
object OcrSignals {
  /** Blur and glare are measured on the grey image downscaled to this longer side. */
  const val SIGNAL_SIDE = 640
  /** A box this close to an image edge (share of the side) touches it. */
  const val EDGE_MARGIN = 0.005
  /** Lines shorter than this share of the image width have too noisy an angle to count. */
  const val MIN_BASELINE_SHARE = 0.2
  /** Steeper lines are vertical or rotated text, not a bent page. */
  const val MAX_BASELINE_DEGREES = 45.0
  /** A glare pixel is at least this bright… */
  const val GLARE_LEVEL = 250
  /** …and this much brighter than the paper (the median grey level). */
  const val GLARE_ABOVE_PAPER = 25

  /** Rec. 601 luma, rounded, so a colour photo becomes the same grey on both platforms. */
  fun luma(red: Int, green: Int, blue: Int): Int =
    ((299 * red + 587 * green + 114 * blue + 500) / 1000).coerceIn(0, 255)

  /** Grey levels of ARGB pixels. */
  fun grey(argb: IntArray, width: Int, height: Int): GreyImage =
    GreyImage(width, height, IntArray(width * height) { i ->
      val p = argb[i]
      luma((p shr 16) and 0xFF, (p shr 8) and 0xFF, p and 0xFF)
    })

  /** The signal image's size: the longer side at most `maxSide`, never upscaled. */
  fun scaledSize(width: Int, height: Int, maxSide: Int = SIGNAL_SIDE): Pair<Int, Int> {
    val longest = max(width, height)
    if (longest <= maxSide || longest <= 0) return Pair(max(width, 1), max(height, 1))
    val scale = maxSide.toDouble() / longest
    return Pair(max(1, (width * scale).roundToInt()), max(1, (height * scale).roundToInt()))
  }

  /**
   * Variance of the 4-neighbour Laplacian over the interior pixels: sharp edges give a wide
   * spread, a soft or shaken photo a narrow one. 0 for an image too small to have an interior.
   */
  fun laplacianVariance(image: GreyImage): Double {
    val w = image.width
    val h = image.height
    if (w < 3 || h < 3 || image.pixels.size < w * h) return 0.0
    val p = image.pixels
    var sum = 0.0
    var sumSquares = 0.0
    for (y in 1 until h - 1) {
      val row = y * w
      for (x in 1 until w - 1) {
        val i = row + x
        val v = (p[i - w] + p[i + w] + p[i - 1] + p[i + 1] - 4 * p[i]).toDouble()
        sum += v
        sumSquares += v * v
      }
    }
    val count = ((w - 2) * (h - 2)).toDouble()
    val mean = sum / count
    return max(0.0, sumSquares / count - mean * mean)
  }

  /** The lower median grey level. */
  fun median(image: GreyImage): Int {
    val histogram = IntArray(256)
    for (level in image.pixels) histogram[level.coerceIn(0, 255)]++
    val half = image.pixels.size / 2
    var seen = 0
    for (level in 0..255) {
      seen += histogram[level]
      if (seen > half) return level
    }
    return 255
  }

  /**
   * Share of pixels blown out to near-white and clearly brighter than the paper around them: a
   * reflection on glossy thermal paper. A clean white scan, whose paper is itself near-white, has
   * none.
   */
  fun glareRatio(image: GreyImage): Double {
    if (image.pixels.isEmpty()) return 0.0
    val floor = max(GLARE_LEVEL, median(image) + GLARE_ABOVE_PAPER)
    if (floor > 255) return 0.0
    return image.pixels.count { it >= floor }.toDouble() / image.pixels.size
  }

  /**
   * Standard deviation, in degrees, of the long baselines' angles: a flat page, even tilted, reads
   * as one angle; a crumpled or folded one bends its lines apart. 0 with fewer than three.
   */
  fun curvature(baselines: List<Baseline>, imageWidth: Double): Double {
    val minLength = MIN_BASELINE_SHARE * imageWidth
    val angles =
      baselines.mapNotNull { line ->
        val dx = line.endX - line.startX
        val dy = line.endY - line.startY
        val degrees = Math.toDegrees(atan2(dy, dx))
        if (sqrt(dx * dx + dy * dy) < minLength || abs(degrees) > MAX_BASELINE_DEGREES) null
        else degrees
      }
    if (angles.size < 3) return 0.0
    val mean = angles.sum() / angles.size
    return sqrt(angles.sumOf { (it - mean) * (it - mean) } / angles.size)
  }

  /** Share of line boxes touching an image edge: text running out of the frame. */
  fun clippedShare(boxes: List<LineBox>): Double {
    if (boxes.isEmpty()) return 0.0
    val far = 1 - EDGE_MARGIN
    val touching =
      boxes.count {
        it.x <= EDGE_MARGIN || it.y <= EDGE_MARGIN || it.x + it.w >= far || it.y + it.h >= far
      }
    return touching.toDouble() / boxes.size
  }
}
