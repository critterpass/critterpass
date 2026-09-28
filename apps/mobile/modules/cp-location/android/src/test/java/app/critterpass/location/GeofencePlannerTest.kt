package app.critterpass.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GeofencePlannerTest {
  private fun fence(id: String, radius: Double = 150.0) = PlannedGeofence(id, -8.5, 115.26, radius)

  @Test
  fun `caps at one hundred, floors radius at 150 m and drops duplicates and bad coordinates`() {
    val many = (0 until 130).map { fence("f$it", 60.0) } + fence("f0") + PlannedGeofence("bad", 91.0, 0.0, 200.0)
    val planned = GeofencePlanner.normalize(many)
    assertEquals(100, planned.size)
    assertTrue(planned.all { it.radiusM == 150.0 })
    assertEquals(0, GeofencePlanner.normalize(many, limit = -1).size)
  }

  @Test
  fun `diff keeps unchanged fences and replaces changed ones`() {
    val diff = GeofencePlanner.diff(listOf(fence("a"), fence("b"), fence("c")), listOf(fence("a"), fence("b", 300.0), fence("d")))
    assertEquals(listOf("b", "c"), diff.remove)
    assertEquals(listOf("b", "d"), diff.add.map { it.id })
  }

  @Test
  fun `tiers map to fused priorities and paused stops updates`() {
    assertEquals(FixStream.PRIORITY_HIGH_ACCURACY, FixStream.requestFor("high")?.priority)
    assertEquals(FixStream.PRIORITY_BALANCED, FixStream.requestFor("balanced")?.priority)
    assertEquals(FixStream.PRIORITY_LOW_POWER, FixStream.requestFor("coarse")?.priority)
    assertNull(FixStream.requestFor("paused"))
  }

  @Test
  fun `mock provider fixes carry the simulated flag`() {
    val body = FixStream.body(RawFix(1.0, 2.0, null, 3, -1f, true), stationary = false)
    assertEquals(1, body["mock"])
    assertEquals(1000.0, body["acc"])
    assertEquals(3.0, body["at"])
    assertNull(body["speed"])
    assertEquals(0, FixStream.body(RawFix(1.0, 2.0, 4f, 3, 1.5f, false), true)["mock"])
    assertEquals(1.5, FixStream.body(RawFix(1.0, 2.0, 4f, 3, 1.5f, false), true)["speed"])
  }

  @Test
  fun `standing still needs three slow readings`() {
    assertTrue(FixStream.isStationary(listOf(2f, 0.1f, 0.2f, 0f)))
    assertEquals(false, FixStream.isStationary(listOf(0.1f, 0.2f)))
    assertEquals(false, FixStream.isStationary(listOf(0.1f, 0.9f, 0.2f)))
  }
}
