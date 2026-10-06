package app.critterpass.surfaces.actions

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CategoriesTest {
  @Test
  fun `vote buttons cast the option they name`() {
    val ctx = JSONObject()
      .put("poll_id", "poll-1")
      .put("options", JSONArray().put(JSONObject().put("id", "o1").put("label", "Beach")).put(JSONObject().put("id", "o2").put("label", "Hike")))
    val actions = Categories.actions("cp.vote", ctx)
    assertEquals(listOf("VOTE_1", "VOTE_2", "OPEN"), actions.map { it.id })
    assertEquals(mapOf("poll_id" to "poll-1", "option_id" to "o2"), actions[1].payload)
    assertEquals("Hike", actions[1].label)
    assertEquals("ballot", actions[1].scope)
  }

  @Test
  fun `three options leave no room for OPEN`() {
    val options = JSONArray()
    (1..4).forEach { options.put(JSONObject().put("id", "o$it").put("label", "Option $it")) }
    val actions = Categories.actions("cp.vote", JSONObject().put("poll_id", "p").put("options", options))
    assertEquals(listOf("VOTE_1", "VOTE_2", "VOTE_3"), actions.map { it.id })
  }

  @Test
  fun `buttons whose payload the context cannot build are left out`() {
    assertEquals(listOf("OPEN"), Categories.actions("cp.vote", null).map { it.id })
    assertEquals(emptyList<String>(), Categories.actions("cp.money", JSONObject()).map { it.id })
    assertEquals(listOf("OPEN"), Categories.actions("cp.sos", JSONObject()).map { it.id })
  }

  @Test
  fun `chat reply carries the crew and puts the typed text in the body`() {
    val actions = Categories.actions("cp.chat", JSONObject().put("crew_id", "crew-1").put("seq", 41))
    assertEquals(listOf("REPLY", "READ"), actions.map { it.id })
    assertEquals("body", actions[0].replyKey)
    assertEquals(41L, actions[1].payload["seq"])
  }

  @Test
  fun `every background button names a command and an action-key scope`() {
    val ctx = JSONObject()
      .put("change_set_id", "c").put("disruption_id", "d").put("action_id", "a").put("leave_by_id", "l")
      .put("sos_id", "s").put("payment_id", "p").put("crew_id", "k").put("seq", 1).put("proposal_id", "r").put("share_id", "h")
    val categories = listOf("cp.changeset", "cp.disruption", "cp.leaveby", "cp.sos", "cp.money", "cp.chat", "cp.rsvp", "cp.help")
    for (category in categories) {
      val actions = Categories.actions(category, ctx)
      assertTrue(category, actions.isNotEmpty() && actions.size <= Categories.MAX_BUTTONS)
      actions.filterNot { it.foreground }.forEach { assertTrue("$category ${it.id}", it.command != null && it.scope != null) }
    }
    assertEquals(mapOf("leave_by_id" to "l", "state" to "up", "source" to "notification"), Categories.actions("cp.leaveby", ctx)[0].payload)
  }
}
