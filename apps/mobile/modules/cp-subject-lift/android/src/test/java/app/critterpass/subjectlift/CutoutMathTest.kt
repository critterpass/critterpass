package app.critterpass.subjectlift

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CutoutMathTest {
  private fun alpha(pixel: Int) = pixel ushr 24

  /** A `side`×`side` confidence mask with a solid disc of subject in the middle. */
  private fun discMask(side: Int, radius: Int): FloatArray =
    FloatArray(side * side) { i ->
      val dx = i % side - side / 2
      val dy = i / side - side / 2
      if (dx * dx + dy * dy <= radius * radius) 1f else 0f
    }

  @Test
  fun confidenceBecomesAlphaAndColourIsKept() {
    val pixels = intArrayOf(0xFF102030.toInt(), 0xFF405060.toInt(), 0xFF708090.toInt())
    val out = CutoutMath.maskToAlpha(pixels, floatArrayOf(0f, 0.5f, 1f))
    assertEquals(listOf(0, 128, 255), out.map(::alpha))
    assertEquals(listOf(0x102030, 0x405060, 0x708090), out.map { it and 0xFFFFFF })
  }

  @Test
  fun boundsHugTheConfidentSubject() {
    val side = 40
    val mask = FloatArray(side * side)
    for (y in 5..14) for (x in 20..29) mask[y * side + x] = 0.9f
    mask[0] = 0.3f // below the confidence line: not part of the subject
    assertEquals(PixelBounds(left = 20, top = 5, width = 10, height = 10),
      CutoutMath.subjectBounds(mask, side, side))
  }

  @Test
  fun noSubjectOrASpeckMeansFallback() {
    assertNull(CutoutMath.subjectBounds(FloatArray(100 * 100), 100, 100))
    val speck = FloatArray(100 * 100).also { it[5050] = 1f }
    assertNull(CutoutMath.subjectBounds(speck, 100, 100))
  }

  @Test
  fun cropCutsTheSubjectOutWithTransparentCorners() {
    val side = 64
    val photo = IntArray(side * side) { 0xFFAA7744.toInt() }
    val mask = discMask(side, 12)
    val bounds = CutoutMath.subjectBounds(mask, side, side)!!
    assertEquals(PixelBounds(20, 20, 25, 25), bounds)
    val cut = CutoutMath.crop(CutoutMath.maskToAlpha(photo, mask), side, bounds)
    assertEquals(25 * 25, cut.size)
    val corners = intArrayOf(cut[0], cut[24], cut[24 * 25], cut[25 * 25 - 1]).map(::alpha)
    assertEquals(listOf(0, 0, 0, 0), corners)
    assertEquals(255, alpha(cut[12 * 25 + 12]))
  }

  @Test
  fun cutoutsFitInsideTheMarginAndPhotosFillTheCircle() {
    val fitted = CutoutMath.placement(200.0, 400.0, cutout = true, zoom = 1.0, side = 100.0)
    assertEquals(42.0, fitted.width, 1e-9)
    assertEquals(84.0, fitted.height, 1e-9)
    assertEquals(29.0, fitted.left, 1e-9)
    assertEquals(8.0, fitted.top, 1e-9)

    val filled = CutoutMath.placement(200.0, 400.0, cutout = false, zoom = 2.0, side = 100.0)
    assertEquals(200.0, filled.width, 1e-9)
    assertEquals(400.0, filled.height, 1e-9)
    assertEquals(-50.0, filled.left, 1e-9)

    // Zoom never shrinks below the fitted size.
    assertEquals(fitted, CutoutMath.placement(200.0, 400.0, cutout = true, zoom = 0.5, side = 100.0))
  }

  @Test
  fun fallbackClipsThePhotoToACircle() {
    val side = 32
    val pixels = IntArray(side * side) { 0xFF336699.toInt() }
    CutoutMath.clipToCircle(pixels, side)
    val at = { x: Int, y: Int -> alpha(pixels[y * side + x]) }
    assertEquals(listOf(0, 0, 0, 0), listOf(at(0, 0), at(31, 0), at(0, 31), at(31, 31)))
    assertEquals(255, at(16, 16))
    assertEquals(255, at(16, 1))
    assertEquals(255, at(1, 16))
    assertEquals(0x336699, pixels[0] and 0xFFFFFF)
  }

  @Test
  fun hashesAsLowercaseHex() {
    assertArrayEquals(
      "00ff10ab".toCharArray(),
      CutoutMath.hex(byteArrayOf(0, -1, 16, -85)).toCharArray())
  }
}
