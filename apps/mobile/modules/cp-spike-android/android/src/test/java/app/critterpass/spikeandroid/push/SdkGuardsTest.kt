package app.critterpass.spikeandroid.push

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SdkGuardsTest {
  @Test
  fun `progress style requires api 36 or above`() {
    assertFalse(SdkGuards.supportsProgressStyle(35))
    assertTrue(SdkGuards.supportsProgressStyle(36))
    assertTrue(SdkGuards.supportsProgressStyle(37))
  }

  @Test
  fun `metric style requires api 37 or above, with 36 falling back to progress style`() {
    assertFalse(SdkGuards.supportsMetricStyle(35))
    assertFalse(SdkGuards.supportsMetricStyle(36))
    assertTrue(SdkGuards.supportsMetricStyle(37))
  }
}
