package app.critterpass.surfaces.permissions

import org.junit.Assert.assertEquals
import org.junit.Test

class DegradeMatrixTest {
  /** A fresh install on Android 16: notifications allowed, nothing else granted. */
  private val fresh = SurfacePermissionState(36, notifications = true, exactAlarm = false, fullScreenIntent = false, promoted = true, dndAccess = false)

  @Test
  fun `a fresh install rings a heads-up alarm at an inexact time and an SOS that respects DND`() {
    assertEquals(AlarmPath.HEADS_UP_INEXACT, DegradeMatrix.alarm(fresh))
    assertEquals(SosPath.HIGH_RESPECTS_DND, DegradeMatrix.sos(fresh))
    assertEquals(LiveUpdatePath.PROMOTED, DegradeMatrix.liveUpdates(fresh))
    assertEquals(
      listOf(SettingsBanner.EXACT_ALARM, SettingsBanner.FULL_SCREEN_INTENT, SettingsBanner.DND_ACCESS),
      DegradeMatrix.banners(fresh),
    )
  }

  @Test
  fun `full screen needs both the exact alarm and the full-screen grant`() {
    assertEquals(AlarmPath.HEADS_UP_EXACT, DegradeMatrix.alarm(fresh.copy(exactAlarm = true)))
    assertEquals(AlarmPath.HEADS_UP_INEXACT, DegradeMatrix.alarm(fresh.copy(fullScreenIntent = true)))
    assertEquals(AlarmPath.FULL_SCREEN_EXACT, DegradeMatrix.alarm(fresh.copy(exactAlarm = true, fullScreenIntent = true)))
  }

  @Test
  fun `SOS bypasses DND only with notification-policy access`() {
    assertEquals(SosPath.BYPASS_DND, DegradeMatrix.sos(fresh.copy(dndAccess = true)))
  }

  @Test
  fun `promotion turned off falls back to an ongoing notification and offers the setting`() {
    val off = fresh.copy(promoted = false)
    assertEquals(LiveUpdatePath.ONGOING, DegradeMatrix.liveUpdates(off))
    assertEquals(true, SettingsBanner.PROMOTED in DegradeMatrix.banners(off))
  }

  @Test
  fun `older Android is not offered settings it does not have`() {
    val android12 = SurfacePermissionState(31, true, exactAlarm = false, fullScreenIntent = true, promoted = false, dndAccess = true)
    assertEquals(LiveUpdatePath.ONGOING, DegradeMatrix.liveUpdates(android12))
    assertEquals(listOf(SettingsBanner.EXACT_ALARM), DegradeMatrix.banners(android12))
  }

  @Test
  fun `notifications off only offers turning them on`() {
    val off = fresh.copy(notifications = false)
    assertEquals(AlarmPath.IN_APP_ONLY, DegradeMatrix.alarm(off))
    assertEquals(SosPath.IN_APP_ONLY, DegradeMatrix.sos(off))
    assertEquals(listOf(SettingsBanner.NOTIFICATIONS), DegradeMatrix.banners(off))
  }
}
