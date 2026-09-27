package app.critterpass.deferredlink

import androidx.test.core.app.ApplicationProvider
import android.content.Context
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class InstallReferrerGateTest {
  private val context: Context = ApplicationProvider.getApplicationContext()

  @Test
  fun `reads the referrer on the first launch only`() {
    val gate = InstallReferrerGate(SharedPreferencesFlagStore(context))
    assertTrue(gate.shouldRead())
    gate.markRead()
    assertFalse(gate.shouldRead())
  }

  @Test
  fun `remembers the read across module instances`() {
    InstallReferrerGate(SharedPreferencesFlagStore(context)).markRead()
    assertFalse(InstallReferrerGate(SharedPreferencesFlagStore(context)).shouldRead())
  }
}
