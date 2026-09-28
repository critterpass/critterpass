package app.critterpass.permissions

import org.junit.Assert.assertEquals
import org.junit.Test

class StatusMappingTest {
  private val granted = KindState(NormalizedStatus.GRANTED, true)
  private val never = KindState(NormalizedStatus.NOT_DETERMINED, true)
  private val deniedOnce = KindState(NormalizedStatus.DENIED, true)
  private val deniedForGood = KindState(NormalizedStatus.DENIED, false)

  @Test
  fun `expo statuses map to the normalized set`() {
    assertEquals(granted, StatusMapping.fromExpo("granted", true))
    assertEquals(never, StatusMapping.fromExpo("undetermined", false))
    assertEquals(deniedForGood, StatusMapping.fromExpo("denied", false))
    assertEquals(deniedOnce, StatusMapping.fromExpo("denied", true))
  }

  @Test
  fun `selected photos only is limited access`() {
    assertEquals(NormalizedStatus.LIMITED, StatusMapping.photos(deniedOnce, granted).status)
    assertEquals(granted, StatusMapping.photos(granted, never))
    assertEquals(deniedOnce, StatusMapping.photos(deniedOnce, null))
  }

  @Test
  fun `location levels, precision and the separate always step`() {
    val none = StatusMapping.location(never, never, never)
    assertEquals(LocationState(never, "none", false), none)
    val refused = StatusMapping.location(deniedForGood, deniedOnce, never)
    assertEquals(LocationState(deniedForGood, "none", false), refused)
    val approximate = StatusMapping.location(deniedOnce, granted, never)
    assertEquals("wiu", approximate.level)
    assertEquals(false, approximate.precise)
    assertEquals(true, approximate.state.canAskAgain)
    val always = StatusMapping.location(granted, granted, granted)
    assertEquals(LocationState(KindState(NormalizedStatus.GRANTED, false), "always", true), always)
    val backgroundRefused = StatusMapping.location(granted, granted, deniedForGood)
    assertEquals("wiu", backgroundRefused.level)
    assertEquals(false, backgroundRefused.state.canAskAgain)
  }

  @Test
  fun `special access is settings only`() {
    assertEquals(KindState(NormalizedStatus.GRANTED, false), StatusMapping.specialAccess(true))
    assertEquals(KindState(NormalizedStatus.DENIED, false), StatusMapping.specialAccess(false))
    assertEquals(NormalizedStatus.DENIED, StatusMapping.notificationsLegacy(false).status)
  }

  @Test
  fun `maps carry the wire names`() {
    assertEquals(mapOf("status" to "limited", "canAskAgain" to true), KindState(NormalizedStatus.LIMITED, true).toMap())
    assertEquals("always", StatusMapping.location(granted, granted, granted).toMap()["level"])
  }
}
