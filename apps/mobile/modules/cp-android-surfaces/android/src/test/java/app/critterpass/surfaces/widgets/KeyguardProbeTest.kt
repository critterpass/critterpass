package app.critterpass.surfaces.widgets

import app.critterpass.surfaces.hub.KeyguardRule
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class KeyguardProbeTest {
  @Test
  fun `an Android 16 phone keeps lock-screen widgets hidden`() {
    assertFalse(KeyguardRule.supported(36, 3_600_000, 411))
    assertFalse(KeyguardRule.supported(36, 3_600_001, 411))
  }

  @Test
  fun `a QPR2 tablet passes, an earlier one does not`() {
    assertTrue(KeyguardRule.supported(36, 3_600_001, 800))
    assertFalse(KeyguardRule.supported(36, 3_600_000, 800))
    assertFalse(KeyguardRule.supported(35, null, 800))
    assertTrue(KeyguardRule.supported(37, null, 800))
  }
}
