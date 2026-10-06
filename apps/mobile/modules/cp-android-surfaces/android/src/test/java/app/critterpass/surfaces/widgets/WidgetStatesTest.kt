package app.critterpass.surfaces.widgets

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetStatesTest {
  // A schema-1 snapshot as packages/domain buildWidgetSnapshot writes it (no Boost, no Pass+).
  private val json = """
    {"schema":1,"generated_at":"2026-10-06T06:00:00.000Z",
     "trip":{"id":"t","destination":"Đà Lạt","status":"booked","start_date":"2026-10-22","end_date":"2026-10-25","tz":"Asia/Ho_Chi_Minh"},
     "countdown":{"target_at":"2026-10-22T01:30:00.000Z"},
     "vote":{"poll_id":"p","question":"Dinner?","status":"open","closes_at":null,
       "options":[{"id":"o1","label":"Phở","votes":2},{"id":"o2","label":"Bánh mì","votes":1}],
       "voted":3,"eligible":5,"my_option_id":null,"winner_option_id":null},
     "today":null,
     "balances":{"currency":"VND","net_minor":-125000,"nudge":{"user_id":"u","first_name":"Linh","available_at":null}},
     "crew":null,"critterdex":{"found":12,"total":80},"next_flight":null,
     "next_leave_by":{"id":"l","title":"Airport","place_name":"SGN","leave_at":"2026-10-22T00:00:00+07:00","state":"scheduled"},
     "entitlements":{"pass_plus":false,"boost_active":false},"locked":["crew","next_flight"],"future_field":1}
  """.trimIndent()

  private val snapshot = requireNotNull(WidgetSnapshot.parse(JSONObject(json)))
  private val generated = snapshot.generatedAtMillis

  @Test
  fun `reads the sections the widgets draw and ignores unknown fields`() {
    assertEquals("Đà Lạt", snapshot.destination)
    assertEquals(listOf("Phở", "Bánh mì"), snapshot.vote?.options?.map { it.label })
    assertEquals(-125_000L, snapshot.balances?.netMinor)
    assertEquals("Linh", snapshot.balances?.nudgeFirstName)
    assertEquals(12, snapshot.critterdexFound)
    assertEquals(1_792_602_000_000L, snapshot.nextLeaveBy?.leaveAtMillis)
    assertNull(snapshot.today)
  }

  @Test
  fun `a file of another schema is not read`() {
    assertNull(WidgetSnapshot.parse(JSONObject(json).put("schema", 2)))
  }

  @Test
  fun `active, empty and stale states`() {
    assertTrue(WidgetStates.of(WidgetKind.VOTE, snapshot, generated) == WidgetState.Active(snapshot, stale = false))
    assertEquals(WidgetState.Empty, WidgetStates.of(WidgetKind.TODAY, snapshot, generated))
    val later = generated + WidgetStates.STALE_AFTER_MS + 1
    assertEquals(WidgetState.Active(snapshot, stale = true), WidgetStates.of(WidgetKind.COUNTDOWN, snapshot, later))
    assertEquals(WidgetState.SignedOut, WidgetStates.of(WidgetKind.COUNTDOWN, null, later))
  }

  @Test
  fun `tiered widgets show their offer while locked`() {
    assertEquals(WidgetState.Locked("boost"), WidgetStates.of(WidgetKind.CREW, snapshot, generated))
    assertEquals(WidgetState.Locked("pass_plus"), WidgetStates.of(WidgetKind.NEXT_FLIGHT, snapshot, generated))
    val boosted = snapshot.copy(boostActive = true, locked = setOf("next_flight"))
    assertEquals(WidgetState.Empty, WidgetStates.of(WidgetKind.CREW, boosted, generated))
  }

  @Test
  fun `countdown and money read the way the widgets print them`() {
    assertEquals(Countdown(1, 2, 3), Countdown.until(26 * 3_600_000L + 3 * 60_000L, 0))
    assertTrue(Countdown.until(0, 5).passed)
    assertEquals("−125,000 VND", MoneyText.of("VND", -125_000))
    assertEquals("12.50 SGD", MoneyText.of("SGD", 1_250))
  }
}
