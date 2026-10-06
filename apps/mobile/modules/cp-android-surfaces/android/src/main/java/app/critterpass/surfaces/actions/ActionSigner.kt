package app.critterpass.surfaces.actions

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Mac

/** The three headers a signed request carries. */
data class SignedHeaders(val keyId: String, val timestamp: String, val signature: String)

/**
 * `/v1/actions` request signing (api-contracts-async.md §5): `X-CP-Sig =
 * base64url(HMAC-SHA256(secret, method \n path \n ts \n hex(sha256(body))))`, the same string the
 * server's verifier (services/api/src/auth/action-keys/verify.ts) and the iOS targets
 * (`SignedRequest.swift`) build. Pure apart from the [Mac] it is handed: the app passes one keyed by
 * the Android Keystore entry, tests one keyed by the raw secret.
 */
object ActionSigner {
  fun canonical(method: String, path: String, timestamp: String, body: ByteArray): String =
    "$method\n$path\n$timestamp\n${sha256Hex(body)}"

  fun sign(mac: Mac, keyId: String, method: String, path: String, body: ByteArray, nowMillis: Long): SignedHeaders {
    val ts = (nowMillis / 1000).toString()
    val digest = mac.doFinal(canonical(method, path, ts, body).toByteArray(Charsets.UTF_8))
    return SignedHeaders(keyId, ts, base64Url(digest))
  }

  fun sha256Hex(bytes: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

  fun base64Url(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

  private val random = SecureRandom()

  /** A time-ordered UUIDv7 (RFC 9562): the server only accepts v7 `op_id`s. */
  fun uuidV7(nowMillis: Long): String {
    val bytes = ByteArray(16)
    random.nextBytes(bytes)
    for (index in 0 until 6) bytes[index] = (nowMillis ushr (8 * (5 - index))).toByte()
    bytes[6] = ((bytes[6].toInt() and 0x0F) or 0x70).toByte()
    bytes[8] = ((bytes[8].toInt() and 0x3F) or 0x80).toByte()
    val hex = bytes.joinToString("") { "%02x".format(it) }
    return listOf(hex.substring(0, 8), hex.substring(8, 12), hex.substring(12, 16), hex.substring(16, 20), hex.substring(20))
      .joinToString("-")
  }
}
