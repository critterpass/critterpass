package app.critterpass.haptics

import android.os.VibrationEffect
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CpHapticsModuleTest {
  @Test
  fun `sos primitives are three short, three long, three short pulses`() {
    val primitives = CpHapticsModule.sosPrimitives()
    assertEquals(9, primitives.size)

    val click = VibrationEffect.Composition.PRIMITIVE_CLICK
    val thud = VibrationEffect.Composition.PRIMITIVE_THUD

    assertTrue(primitives.subList(0, 3).all { it.primitiveId == click })
    assertTrue(primitives.subList(3, 6).all { it.primitiveId == thud })
    assertTrue(primitives.subList(6, 9).all { it.primitiveId == click })
  }

  @Test
  fun `every sos primitive plays at full scale`() {
    val primitives = CpHapticsModule.sosPrimitives()
    assertTrue(primitives.all { it.scale == 1.0f })
  }

  @Test
  fun `long pulses have a longer delay than short pulses`() {
    val primitives = CpHapticsModule.sosPrimitives()
    val shortDelay = primitives.first().delayMillis
    val longDelay = primitives[3].delayMillis
    assertTrue(longDelay > shortDelay)
  }
}
