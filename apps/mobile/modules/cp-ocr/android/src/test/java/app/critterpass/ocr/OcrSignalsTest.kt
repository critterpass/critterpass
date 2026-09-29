package app.critterpass.ocr

import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The signal math on synthetic grey images built in the test; Swift `OcrSignalsTests` checks the
 * same cases so both platforms report the same numbers.
 */
class OcrSignalsTest {
  private fun image(width: Int, height: Int, level: (Int, Int) -> Int) =
    GreyImage(width, height, IntArray(width * height) { i ->
      level(i % width, i / width).coerceIn(0, 255)
    })

  /**
   * Dark 2 px text strokes every 8 px on light paper, like small print (66 px wide: the interior
   * holds exactly eight periods, so half its columns sit on an edge of Laplacian ±190).
   */
  private fun stripes(side: Int) = image(side, side) { x, _ -> if (x % 8 < 2) 30 else 220 }

  /** A 5×5 box blur: what a shaken hand does to the same strokes. */
  private fun boxBlur(source: GreyImage) =
    image(source.width, source.height) { x, y ->
      var sum = 0
      var count = 0
      for (dy in -2..2) for (dx in -2..2) {
        val sx = x + dx
        val sy = y + dy
        if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue
        sum += source.pixels[sy * source.width + sx]
        count++
      }
      sum / count
    }

  @Test
  fun laplacianOfASinglePoint() {
    val point = image(5, 5) { x, y -> if (x == 2 && y == 2) 100 else 0 }
    assertEquals(200_000.0 / 9.0, OcrSignals.laplacianVariance(point), 1e-9)
  }

  @Test
  fun sharpPrintScoresFarAboveItsBlurredCopy() {
    val sharp = stripes(66)
    val soft = boxBlur(sharp)
    assertEquals(18_050.0, OcrSignals.laplacianVariance(sharp), 1.0)
    assertTrue(OcrSignals.laplacianVariance(soft) < OcrSignals.laplacianVariance(sharp) / 10)
    assertEquals(0.0, OcrSignals.laplacianVariance(image(32, 32) { _, _ -> 180 }), 0.0)
    assertEquals(0.0, OcrSignals.laplacianVariance(image(2, 40) { x, _ -> x * 100 }), 0.0)
  }

  @Test
  fun glareIsBlownOutLightBrighterThanThePaper() {
    val hotSpot = image(100, 100) { x, y -> if (x < 10 && y < 10) 255 else 200 }
    assertEquals(0.01, OcrSignals.glareRatio(hotSpot), 1e-12)
    val whiteScan = image(100, 100) { x, _ -> if (x % 10 == 0) 0 else 252 }
    assertEquals(0.0, OcrSignals.glareRatio(whiteScan), 0.0)
    assertEquals(0.0, OcrSignals.glareRatio(image(10, 10) { _, _ -> 120 }), 0.0)
    assertEquals(30, OcrSignals.median(image(4, 1) { x, _ -> listOf(10, 20, 30, 40)[x] }))
  }

  private fun baseline(degrees: Double, length: Double = 600.0, y: Double = 100.0): Baseline {
    val r = Math.toRadians(degrees)
    return Baseline(50.0, y, 50 + length * cos(r), y + length * sin(r))
  }

  @Test
  fun curvatureIsTheSpreadOfLongBaselineAngles() {
    val tiltedFlat = List(4) { baseline(4.0) }
    assertEquals(0.0, OcrSignals.curvature(tiltedFlat, 1000.0), 1e-9)
    val bent = listOf(-4.0, 0.0, 4.0).map { baseline(it) }
    assertEquals(sqrt(32.0 / 3.0), OcrSignals.curvature(bent, 1000.0), 1e-9)
    val withNoise = bent + listOf(baseline(30.0, length = 100.0), baseline(80.0), baseline(-60.0))
    assertEquals(sqrt(32.0 / 3.0), OcrSignals.curvature(withNoise, 1000.0), 1e-9)
    assertEquals(0.0, OcrSignals.curvature(bent.take(2), 1000.0), 0.0)
  }

  @Test
  fun clippedCountsBoxesTouchingAnEdge() {
    val boxes =
      listOf(
        LineBox(0.1, 0.1, 0.5, 0.03),
        LineBox(0.002, 0.3, 0.5, 0.03),
        LineBox(0.6, 0.5, 0.398, 0.03),
        LineBox(0.1, 0.97, 0.5, 0.03),
      )
    assertEquals(0.75, OcrSignals.clippedShare(boxes), 0.0)
    assertEquals(0.0, OcrSignals.clippedShare(boxes.take(1)), 0.0)
    assertEquals(0.0, OcrSignals.clippedShare(emptyList()), 0.0)
  }

  @Test
  fun lumaAndSignalSize() {
    assertEquals(76, OcrSignals.luma(255, 0, 0))
    assertEquals(255, OcrSignals.luma(255, 255, 255))
    assertEquals(0, OcrSignals.luma(0, 0, 0))
    val red = OcrSignals.grey(intArrayOf(0xFFFF0000.toInt(), 0xFFFFFFFF.toInt()), 2, 1)
    assertEquals(listOf(76, 255), red.pixels.toList())
    assertEquals(Pair(480, 640), OcrSignals.scaledSize(3000, 4000))
    assertEquals(Pair(300, 200), OcrSignals.scaledSize(300, 200))
  }
}
