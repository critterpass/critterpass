package app.critterpass.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPlanTest {
  private val now = AlarmRequest.parseMillis("2026-10-02T18:00:00Z")

  @Test
  fun `rings exactly only with the exact-alarm grant`() {
    assertEquals(AlarmEngine.EXACT, AlarmPlan.engine(canScheduleExactAlarms = true))
    assertEquals(AlarmEngine.INEXACT, AlarmPlan.engine(canScheduleExactAlarms = false))
  }

  @Test
  fun `shows the full-screen alarm only with the server flag and the user's access`() {
    val flagged = request().copy(fullScreen = true)
    assertTrue(AlarmPlan.useFullScreen(flagged, canUseFullScreenIntent = true))
    assertFalse(AlarmPlan.useFullScreen(flagged, canUseFullScreenIntent = false))
    assertFalse(AlarmPlan.useFullScreen(request(), canUseFullScreenIntent = true))
  }

  @Test
  fun `the first snooze rings again after its minutes with no snooze left`() {
    val outcome = AlarmPlan.snooze(request(), now)
    assertEquals("snooze", outcome.action)
    assertEquals(1, outcome.snoozeCount)
    val again = requireNotNull(outcome.ringAgain)
    assertEquals(now + 5 * 60_000L, again.fireAtMillis)
    assertFalse(again.snoozeAllowed)
    assertEquals(1, again.snoozeCount)
    assertEquals(request().leaveAt, again.leaveAt)
  }

  @Test
  fun `a dismiss after the one snooze still counts but does not ring again`() {
    val used = request().copy(snoozeAllowed = false, snoozeCount = 1)
    val outcome = AlarmPlan.snooze(used, now)
    assertEquals(2, outcome.snoozeCount)
    assertNull(outcome.ringAgain)
  }

  @Test
  fun `i'm up ends the alarm and keeps the snooze count`() {
    val outcome = AlarmPlan.up(request().copy(snoozeCount = 1))
    assertEquals("up", outcome.action)
    assertEquals(1, outcome.snoozeCount)
    assertNull(outcome.ringAgain)
  }

  @Test
  fun `a reboot sets future alarms again, rings missed ones and drops finished leave-bys`() {
    assertEquals(RestoreDecision.SCHEDULE, AlarmPlan.restore(request(), now))
    val missed = AlarmRequest.parseMillis("2026-10-02T19:05:00Z")
    assertEquals(RestoreDecision.RING_NOW, AlarmPlan.restore(request(), missed))
    val over = AlarmRequest.parseMillis("2026-10-02T19:10:00Z")
    assertEquals(RestoreDecision.DROP, AlarmPlan.restore(request(), over))
  }

  @Test
  fun `the big time is the leave-by's wall clock where it happens`() {
    assertEquals("03:10", AlarmPlan.clockText(request().leaveAt))
  }

  @Test
  fun `parses the guide tint and rejects anything else`() {
    assertEquals(0xFFF2A33A.toInt(), AlarmPlan.tintArgb("#F2A33A"))
    assertNull(AlarmPlan.tintArgb("orange"))
    assertNull(AlarmPlan.tintArgb("#F2A33"))
  }

  @Test
  fun `refuses requests no alarm can be set from`() {
    request().validate(now)
    assertThrows(IllegalArgumentException::class.java) { request().copy(leaveById = "batur").validate(now) }
    assertThrows(IllegalArgumentException::class.java) { request().copy(fireAt = "2026-10-03T03:00").validate(now) }
    assertThrows(IllegalArgumentException::class.java) { request().copy(tintHex = "red").validate(now) }
    assertThrows(IllegalArgumentException::class.java) {
      request().copy(fireAt = "2026-10-02T17:59:00Z").validate(now)
    }
  }

  @Test
  fun `reads the JS request, whose numbers arrive as doubles`() {
    val map =
      mapOf<String, Any?>(
        "leaveById" to "0192A4C1-7A3E-7D2B-9F10-3C4D5E6F7A8B",
        "tripId" to "0192a4c1-7a3e-7d2b-9f10-000000000001",
        "fireAt" to "2026-10-03T03:00:00.000+08:00",
        "leaveAt" to "2026-10-03T03:10:00+08:00",
        "title" to "Leave by 03:10 · Batur",
        "subtitle" to "Pickup at the villa gate · Made is outside",
        "guideLine" to "The sun won't wait. Neither will Made. Up!",
        "tintHex" to "#F2A33A",
        "snoozeAllowed" to true,
        "snoozeMinutes" to 5.0,
        "snoozeCount" to 0.0,
        "fullScreen" to false,
        "labels" to
          mapOf(
            "imUp" to "I'm up",
            "slide" to "Slide, I'm up",
            "snooze" to "Snooze 5 min",
            "snoozeNote" to "(Tokek will sigh)",
            "crewPinged" to "Crew was pinged",
          ),
      )
    assertEquals(request(), AlarmRequest.fromMap(map))
  }

  companion object {
    fun request() =
      AlarmRequest(
        leaveById = "0192a4c1-7a3e-7d2b-9f10-3c4d5e6f7a8b",
        tripId = "0192a4c1-7a3e-7d2b-9f10-000000000001",
        fireAt = "2026-10-03T03:00:00.000+08:00",
        leaveAt = "2026-10-03T03:10:00+08:00",
        title = "Leave by 03:10 · Batur",
        subtitle = "Pickup at the villa gate · Made is outside",
        guideLine = "The sun won't wait. Neither will Made. Up!",
        tintHex = "#F2A33A",
        snoozeAllowed = true,
        snoozeMinutes = 5,
        snoozeCount = 0,
        fullScreen = false,
        labels = AlarmLabels("I'm up", "Slide, I'm up", "Snooze 5 min", "(Tokek will sigh)", "Crew was pinged"),
      )
  }
}
