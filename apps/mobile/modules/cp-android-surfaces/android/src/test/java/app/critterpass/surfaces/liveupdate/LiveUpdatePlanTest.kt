package app.critterpass.surfaces.liveupdate

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveUpdatePlanTest {
  // The leave-by spec the worker sends (packages/domain android-live-update.ts, three trail stops).
  private val leaveBySpec = """
    {"style":"metric","status":"leave_by_soon","title":"Pickup at the villa gate",
     "segments":[{"length":10,"tone":"done"},{"length":10,"tone":"ahead"}],
     "points":[{"position":0,"tone":"stop"},{"position":10,"tone":"stop"},{"position":20,"tone":"stop"}],
     "progress":14,"indeterminate":false,"chip":{"until":1760001200},
     "metrics":[{"key":"leave_in","value":20,"unit":"min"},{"key":"up","value":2,"unit":"count"}]}
  """.trimIndent()

  private fun data(surface: String?, spec: String? = leaveBySpec, op: String = "update") = buildMap {
    put("type", "la.leave_by")
    put("op", op)
    put("ref_id", "0192f3c4-0000-7000-8000-000000000001")
    put("state", "{}")
    put("channel_id", "cp_alarm")
    surface?.let { put("surface", it) }
    spec?.let { put("spec", it) }
  }

  @Test
  fun `parses the spec with one segment per leg and the countdown chip`() {
    val spec = requireNotNull(ProgressSpec.parse(leaveBySpec))
    assertEquals(20, spec.max)
    assertEquals(14, spec.progress)
    assertEquals(ProgressSpec.Tone.DONE, spec.segments.first().tone)
    assertEquals(ProgressSpec.Chip.Until(1_760_001_200), spec.chip)
    assertTrue(spec.metricStyle)
    assertEquals(listOf("leave_in", "up"), spec.metrics.map { it.key })
  }

  @Test
  fun `metric style only from API 37, progress style from 36, ongoing below or when promotion is off`() {
    val spec = ProgressSpec.parse(leaveBySpec)
    assertEquals(LiveUpdateForm.METRIC, LiveUpdatePlan.form("live_update", 37, true, spec))
    assertEquals(LiveUpdateForm.PROGRESS, LiveUpdatePlan.form("live_update", 36, true, spec))
    assertEquals(LiveUpdateForm.ONGOING, LiveUpdatePlan.form("live_update", 35, false, spec))
    assertEquals(LiveUpdateForm.ONGOING, LiveUpdatePlan.form("live_update", 36, false, spec))
    assertEquals(LiveUpdateForm.ONGOING, LiveUpdatePlan.form("live_update", 37, true, null))
    assertTrue(LiveUpdatePlan.promotionBlocked("live_update", 36, false))
    assertFalse(LiveUpdatePlan.promotionBlocked("live_update", 35, false))
  }

  @Test
  fun `members who did not start the session get a notification, never a Live Update`() {
    val spec = ProgressSpec.parse(leaveBySpec)
    assertEquals(LiveUpdateForm.ALERT, LiveUpdatePlan.form("high_priority", 37, true, spec))
    assertEquals(LiveUpdateForm.QUIET, LiveUpdatePlan.form("standard", 37, true, spec))
  }

  @Test
  fun `reads the message and keeps I'M UP on the member's own leave-by`() {
    val message = requireNotNull(LiveUpdateMessage.parse(data("live_update")))
    assertEquals("la:leave_by:0192f3c4-0000-7000-8000-000000000001", message.tag)
    assertEquals(listOf("IM_UP"), message.actions(null).map { it.id })
    assertEquals("set_readiness", message.actions(null).single().command)
    assertEquals("la", message.actions(null).single().payload["source"])
  }

  @Test
  fun `a crewmate's SOS offers COMING and the meet-up offers ON MY WAY to those not in it`() {
    val sos = requireNotNull(LiveUpdateMessage.parse(data("high_priority") + ("type" to "la.sos")))
    assertEquals(listOf("COMING", "OPEN"), sos.actions(null).map { it.id })
    val meetUp = requireNotNull(LiveUpdateMessage.parse(data("high_priority") + ("type" to "la.meet_up")))
    assertEquals(listOf("ON_MY_WAY", "OPEN"), meetUp.actions("trip-1").map { it.id })
    assertEquals("on_my_way", meetUp.actions("trip-1").first().payload["kind"])
    val mine = requireNotNull(LiveUpdateMessage.parse(data("live_update") + ("type" to "la.meet_up")))
    assertEquals(listOf("LATE_10", "PING_ALL"), mine.actions("trip-1").map { it.id })
  }

  @Test
  fun `ignores other messages and survives a malformed spec`() {
    assertNull(LiveUpdateMessage.parse(mapOf("type" to "widget.refresh")))
    assertNull(LiveUpdateMessage.parse(data("live_update", op = "pause")))
    assertNull(requireNotNull(LiveUpdateMessage.parse(data("live_update", spec = "{\"segments\":[]}"))).spec)
    assertTrue(requireNotNull(LiveUpdateMessage.parse(data(null, op = "end"))).ends)
  }

  @Test
  fun `chip text fits the status bar`() {
    val now = 1_760_000_000_000L
    assertEquals("20m", ChipText.of(ProgressSpec.Chip.Until(1_760_001_200), now) { it })
    assertEquals("1h05", ChipText.of(ProgressSpec.Chip.Minutes(65), now) { it })
    assertEquals("2/4", ChipText.of(ProgressSpec.Chip.Count(2, 4), now) { it })
    assertEquals("LANDED", ChipText.of(ProgressSpec.Chip.Label("landed"), now) { it.uppercase() })
  }
}
