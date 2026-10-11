package app.critterpass.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SenderStyleTest {
  private val crewId = "0192f0c1-7a2b-7c3d-8e4f-a1b2c3d4e5f6"
  private val nid = "0192f0c1-7a2b-7c3d-8e4f-000000000001"

  private fun data(cp: String, vararg extra: Pair<String, String>): Map<String, String> =
    mapOf(
      "v" to "1",
      "nid" to nid,
      "type" to "crew_chat",
      "channel_id" to "cp_crew_chat",
      "title" to "Mai · Bali crew",
      "body" to "Landing at 6, who's up for dinner?",
      "category" to "cp.chat",
      "cp" to cp,
    ) + extra

  private val memberChat = """
    {"v":1,"nid":"$nid","type":"crew_chat","deeplink":"/crew/$crewId/chat","crew_id":"$crewId",
     "sender":{"kind":"member","id":"u-mai","name":"Mai","avatar":"avatar-mai"},"full":true}
  """.trimIndent()

  @Test
  fun `a crewmate's chat message is a group conversation titled with the crew`() {
    val message = SenderStyle.parse(data(memberChat, "thread_id" to crewId))!!
    val sender = message.sender!!
    assertEquals("cp-user:u-mai", sender.personKey)
    assertEquals("Mai", sender.displayName)
    assertEquals("avatar-mai", sender.avatar)
    assertEquals(crewId, message.conversationId)
    assertEquals("Bali crew", message.conversationTitle)
    assertEquals(crewId, message.groupKey)
    assertEquals("/crew/$crewId/chat", message.deeplink)
    assertEquals("cp_crew_chat", message.channelId)
    assertTrue(message.isGroupConversation)
    assertTrue(message.appendsToConversation)
  }

  @Test
  fun `a guide carries the AI disclosure and a one-to-one conversation per user`() {
    val cp = """
      {"v":1,"nid":"$nid","type":"nudge","sender":{"kind":"guide","id":"tokek","name":"Tokek"},
       "full":true}
    """.trimIndent()
    val message = SenderStyle.parse(
      data(cp, "type" to "nudge", "channel_id" to "cp_guide", "title" to "Tokek"),
      recipientUserId = "u-me",
    )!!
    val sender = message.sender!!
    assertEquals("Tokek · AI guide", sender.displayName)
    assertEquals("cp-guide:tokek", sender.personKey)
    assertTrue(sender.isGuide)
    assertEquals("guide:tokek:u-me", message.conversationId)
    assertNull(message.conversationTitle)
    assertFalse(message.isGroupConversation)
    assertFalse(message.appendsToConversation)
  }

  @Test
  fun `the guide name format comes from the caller's locale`() {
    val cp = """{"v":1,"nid":"$nid","type":"nudge","sender":{"kind":"guide","id":"tokek","name":"Tokek"},"full":true}"""
    val message = SenderStyle.parse(data(cp), guideNameFormat = "%1\$s · hướng dẫn AI")!!
    assertEquals("Tokek · hướng dẫn AI", message.sender!!.displayName)
    assertEquals("guide:tokek", message.conversationId)
  }

  @Test
  fun `a guide push inside a crew belongs to the crew's conversation`() {
    val cp = """
      {"v":1,"nid":"$nid","type":"vote_needs_you","crew_id":"$crewId",
       "sender":{"kind":"guide","id":"tokek","name":"Tokek"},"full":true}
    """.trimIndent()
    val message = SenderStyle.parse(data(cp, "title" to "Where to next?"))!!
    assertEquals(crewId, message.conversationId)
    assertEquals("Where to next?", message.conversationTitle)
    assertFalse(message.appendsToConversation)
  }

  @Test
  fun `a direct member push without a crew is its own conversation`() {
    val cp = """{"v":1,"nid":"$nid","type":"crew_ping","sender":{"kind":"member","id":"u-rin","name":"Rin"},"full":true}"""
    val message = SenderStyle.parse(data(cp))!!
    assertEquals("user:u-rin", message.conversationId)
    assertNull(message.groupKey)
  }

  @Test
  fun `system notifications have no sender and no conversation`() {
    val cp = """{"v":1,"nid":"$nid","type":"billing","sender":{"kind":"system","id":"cp","name":"CritterPass"},"full":true}"""
    val message = SenderStyle.parse(data(cp))!!
    assertNull(message.sender)
    assertNull(message.conversationId)
    assertFalse(message.isGroupConversation)
  }

  @Test
  fun `an unknown channel falls back to trip updates`() {
    val message = SenderStyle.parse(data(memberChat, "channel_id" to "cp_unknown"))!!
    assertEquals(Channels.FALLBACK, message.channelId)
  }

  @Test
  fun `messages that are not ours are left to expo-notifications`() {
    assertNull(SenderStyle.parse(mapOf("title" to "Hi", "body" to "There")))
    assertNull(SenderStyle.parse(data("not json")))
    assertNull(SenderStyle.parse(data(memberChat) - "body"))
    assertNull(SenderStyle.parse(data(memberChat, "title" to " ")))
  }

  @Test
  fun `a title in another shape is kept whole as the crew title`() {
    val sender = NotificationSender("member", "u-mai", "Mai", "Mai", "cp-user:u-mai", null)
    assertEquals("Bali crew", SenderStyle.crewTitle("Mai · Bali crew", sender))
    assertEquals("Mai sent a photo", SenderStyle.crewTitle("Mai sent a photo", sender))
    assertEquals("Mai · ", SenderStyle.crewTitle("Mai · ", sender))
  }

  @Test
  fun `channel ids are unique`() {
    val ids = Channels.ALL.map { it.id }
    assertEquals(ids.size, ids.toSet().size)
    assertTrue(Channels.FALLBACK in ids)
    val local = Channels.ALL.map { it.localId }
    assertEquals(local.size + Channels.RETIRED.size, (local + Channels.RETIRED).toSet().size)
  }

  @Test
  fun `money and critters post quietly on their own local channels and retire the old ones`() {
    assertEquals("cp_money_quiet", Channels.resolve("cp_money"))
    assertEquals("cp_critters_quiet", Channels.resolve("cp_critters"))
    assertEquals("cp_money_quiet", Channels.resolve("cp_money_quiet"))
    assertEquals(listOf("cp_money", "cp_critters"), Channels.RETIRED)
    Channels.ALL.filter { it.id in Channels.RETIRED }.forEach { assertEquals(2, it.importance) }
    val money = SenderStyle.parse(data(memberChat, "channel_id" to "cp_money", "type" to "expense_added"))!!
    assertEquals("cp_money_quiet", money.channelId)
    assertEquals("cp_crew_chat", Channels.localId("cp_crew_chat"))
    assertEquals("cp_sos_dnd", Channels.localId("cp_sos_dnd"))
  }

  @Test
  fun `the header names the channel, and a variant channel carries its base channel's name`() {
    assertEquals(R.string.cp_channel_money, Channels.nameRes("cp_money_quiet"))
    assertEquals(R.string.cp_channel_sos, Channels.nameRes("cp_sos_dnd"))
    assertNull(Channels.nameRes("cp_unknown"))
  }

  @Test
  fun `the subtitle reads as a line under the body, except in a chat thread`() {
    val cp = """{"v":1,"nid":"$nid","type":"nudge","sender":{"kind":"guide","id":"tokek","name":"Tokek"},"full":true}"""
    val briefing = SenderStyle.parse(
      data(cp, "type" to "nudge", "channel_id" to "cp_guide", "subtitle" to "Morning briefing · 4 things today"),
    )!!
    assertEquals("Landing at 6, who's up for dinner?\nMorning briefing · 4 things today", briefing.text)
    val chat = SenderStyle.parse(data(memberChat, "subtitle" to "Bali crew"))!!
    assertEquals(chat.body, chat.text)
  }

  @Test
  fun `a crewmate with no photo is drawn as their initial on their crew colour`() {
    val cp = """
      {"v":1,"nid":"$nid","type":"crew_chat","crew_id":"$crewId",
       "sender":{"kind":"member","id":"u-maya","name":"maya","tone":"orange"},"full":true}
    """.trimIndent()
    val sender = SenderStyle.parse(data(cp))!!.sender!!
    assertEquals("orange", sender.tone)
    assertEquals(app.critterpass.notifications.tokens.CpPremium.Accent.tangerine, InitialAvatar.accent(sender.tone))
    assertEquals("M", InitialAvatar.initial(sender.name))
    assertEquals("Đ", InitialAvatar.initial(" đức"))
    assertNull(InitialAvatar.initial(" "))
    assertNull(InitialAvatar.accent("red"))
  }
}
