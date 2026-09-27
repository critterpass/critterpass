package app.critterpass.spikeandroid.alarm

import org.junit.Assert.assertEquals
import org.junit.Test

class FullScreenIntentGateTest {
  @Test
  fun `below api 34, use-full-screen-intent is a normal manifest permission`() {
    assertEquals(
      FullScreenIntentGate.Decision.GRANTED,
      FullScreenIntentGate.decide(sdkInt = 33, osReportsCanUseFullScreenIntent = false),
    )
  }

  @Test
  fun `api 34+ with the runtime permission granted`() {
    assertEquals(
      FullScreenIntentGate.Decision.GRANTED,
      FullScreenIntentGate.decide(sdkInt = 34, osReportsCanUseFullScreenIntent = true),
    )
  }

  @Test
  fun `api 34+ denied by default requires the settings deep link`() {
    assertEquals(
      FullScreenIntentGate.Decision.REQUIRES_SETTINGS,
      FullScreenIntentGate.decide(sdkInt = 34, osReportsCanUseFullScreenIntent = false),
    )
  }

  @Test
  fun `api 36 denied still requires settings`() {
    assertEquals(
      FullScreenIntentGate.Decision.REQUIRES_SETTINGS,
      FullScreenIntentGate.decide(sdkInt = 36, osReportsCanUseFullScreenIntent = false),
    )
  }
}
