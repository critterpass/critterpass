package app.critterpass.surfaces.actions

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ActionSignerTest {
  private val secret = "k3Y-secret-0123456789abcdefghijklmnop"
  private val body = """{"cmd":"cast_ballot","op_id":"0192f3c4-0000-7000-8000-000000000001"}""".toByteArray()

  /** The Keystore key signs with the secret's UTF-8 bytes, exactly as the server's verifier keys its HMAC. */
  private fun mac(): Mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(secret.toByteArray(), "HmacSHA256")) }

  // Reference values computed with node:crypto the way services/api/src/auth/action-keys/verify.ts
  // checks a request: createHmac('sha256', secret).update(`${method}\n${path}\n${ts}\n${sha256hex(body)}`).
  @Test
  fun `signature matches the server's verifier for a POST with a body`() {
    val headers = ActionSigner.sign(mac(), "key-1", "POST", "/v1/actions", body, 1_760_000_000_123L)
    assertEquals("1760000000", headers.timestamp)
    assertEquals("key-1", headers.keyId)
    assertEquals("fZlsqvQNZprGIp6ODoNsxQT6b2BWTJ1BFuIxTBmrYAI", headers.signature)
  }

  @Test
  fun `signature matches the server's verifier for a GET with no body`() {
    val headers = ActionSigner.sign(mac(), "key-1", "GET", "/v1/notifications/abc", ByteArray(0), 1_760_000_000_000L)
    assertEquals("vEhoIo2N5u68S3omSdw4FpGPhqLMeuMtvhI_A5dRJgU", headers.signature)
  }

  @Test
  fun `canonical string hashes the body as lowercase hex`() {
    assertEquals(
      "POST\n/v1/actions\n1760000000\n4bbc67faaafaba488fddceca39d317ce767817b3d1aed9306396b5dfc976b3e9",
      ActionSigner.canonical("POST", "/v1/actions", "1760000000", body),
    )
  }

  @Test
  fun `op ids are version 7 uuids that sort by time`() {
    val earlier = ActionSigner.uuidV7(1_760_000_000_000L)
    val later = ActionSigner.uuidV7(1_760_000_000_001L)
    val shape = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    assertTrue(shape.matches(earlier))
    assertTrue(earlier < later)
  }

  @Test
  fun `envelope carries the key's actor and device and keeps the queued op id`() {
    val pending = JSONObject()
      .put("op_id", "0192f3c4-0000-7000-8000-000000000001")
      .put("cmd", "cast_ballot")
      .put("v", 1)
      .put("via", "notif_action")
      .put("scope", "ballot")
      .put("client_ts", "2026-10-06T08:00:00Z")
      .put("payload", JSONObject().put("poll_id", "p").put("option_id", "o"))
    val key = ActionKeyMeta("key-1", setOf("ballot"), Long.MAX_VALUE, "device-1", "user-1")
    val envelope = JSONObject(String(ActionEnvelope.build(pending, key, "1.4.0", "Asia/Ho_Chi_Minh")))
    assertEquals("0192f3c4-0000-7000-8000-000000000001", envelope.getString("op_id"))
    assertEquals("user-1", envelope.getJSONObject("actor").getString("uid"))
    assertEquals("notif_action", envelope.getJSONObject("actor").getString("via"))
    assertEquals("android", envelope.getJSONObject("device").getString("platform"))
    assertEquals("device-1", envelope.getJSONObject("device").getString("id"))
    assertEquals("o", envelope.getJSONObject("payload").getString("option_id"))
    assertTrue(!envelope.has("scope"))
  }

  @Test
  fun `answers decide whether the queued entry stays`() {
    assertEquals(ActionOutcome.SENT, ActionEnvelope.classify(200, "{}"))
    assertEquals(ActionOutcome.RETRY, ActionEnvelope.classify(null, null))
    assertEquals(ActionOutcome.RETRY, ActionEnvelope.classify(503, null))
    assertEquals(ActionOutcome.RETRY, ActionEnvelope.classify(429, """{"error":{"code":"RATE_LIMITED","retryable":true}}"""))
    assertEquals(
      ActionOutcome.LEAVE_FOR_APP,
      ActionEnvelope.classify(403, """{"error":{"code":"ACTION_KEY_SCOPE","retryable":false}}"""),
    )
    assertEquals(
      ActionOutcome.REJECTED,
      ActionEnvelope.classify(409, """{"error":{"code":"STATE_INVALID","retryable":false}}"""),
    )
  }

  @Test
  fun `a key only sends scopes it holds until it expires`() {
    val key = ActionKeyMeta("key-1", setOf("ballot", "readiness"), 2_000L, "d", "u")
    assertTrue(key.allows("ballot", 1_000L))
    assertTrue(!key.allows("sos", 1_000L))
    assertTrue(!key.allows("ballot", 2_000L))
  }
}
