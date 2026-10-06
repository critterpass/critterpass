package app.critterpass.surfaces.actions

import android.content.Context
import android.os.Build
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.security.keystore.KeyProtection
import android.util.Log
import java.security.KeyStore
import java.time.Instant
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.SecretKeySpec
import org.json.JSONObject

/**
 * The device action key on Android (api-contracts-async.md §5): the server-issued secret is
 * imported once into the Android Keystore as a non-exportable `HmacSHA256` signing key, so
 * receivers, widgets and workers can sign `/v1/actions` without the app running and the secret is
 * never readable again. Key id, scopes, expiry and owner live in plain preferences (they are not
 * secret). Revoking deletes the Keystore entry.
 */
class ActionKeyStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /**
   * Imports the key JSON the app received from `POST /v1/devices/{id}/action-keys` (`key_id`,
   * `secret`, `scopes`, `expires_at`, `device_id`, `user_id`). The same key id twice is a no-op.
   */
  fun import(json: String): Boolean {
    val value = JSONObject(json)
    val keyId = value.getString("key_id")
    val scopesJson = value.getJSONArray("scopes")
    val meta = ActionKeyMeta(
      keyId = keyId,
      scopes = (0 until scopesJson.length()).map(scopesJson::getString).toSet(),
      expiresAtMillis = Instant.parse(value.getString("expires_at")).toEpochMilli(),
      deviceId = value.getString("device_id"),
      userId = value.getString("user_id"),
    )
    if (meta() == meta && keyStore().containsAlias(ALIAS)) return true
    val secret = SecretKeySpec(value.getString("secret").toByteArray(Charsets.UTF_8), KeyProperties.KEY_ALGORITHM_HMAC_SHA256)
    keyStore().setEntry(
      ALIAS,
      KeyStore.SecretKeyEntry(secret),
      KeyProtection.Builder(KeyProperties.PURPOSE_SIGN).setDigests(KeyProperties.DIGEST_SHA256).build(),
    )
    prefs.edit()
      .putString("key_id", meta.keyId)
      .putStringSet("scopes", meta.scopes)
      .putLong("expires_at", meta.expiresAtMillis)
      .putString("device_id", meta.deviceId)
      .putString("user_id", meta.userId)
      .apply()
    Log.i(TAG, "action key ${meta.keyId} imported; secure hardware: ${isInsideSecureHardware()}")
    return true
  }

  fun meta(): ActionKeyMeta? {
    val keyId = prefs.getString("key_id", null) ?: return null
    return ActionKeyMeta(
      keyId = keyId,
      scopes = prefs.getStringSet("scopes", emptySet()).orEmpty(),
      expiresAtMillis = prefs.getLong("expires_at", 0),
      deviceId = prefs.getString("device_id", null) ?: return null,
      userId = prefs.getString("user_id", null) ?: return null,
    )
  }

  /** A [Mac] keyed by the Keystore entry, or null when no key was imported. */
  fun mac(): Mac? {
    val key = keyStore().getKey(ALIAS, null) as? SecretKey ?: return null
    return Mac.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256).apply { init(key) }
  }

  /** Sign-out, device removal or a revoked key: nothing may sign as this user any more. */
  fun revoke() {
    runCatching { keyStore().deleteEntry(ALIAS) }
    prefs.edit().clear().apply()
  }

  /** True when the key lives in a TEE or StrongBox; the key material is never exported either way. */
  fun isInsideSecureHardware(): Boolean = runCatching {
    val key = keyStore().getKey(ALIAS, null) as SecretKey
    val factory = SecretKeyFactory.getInstance(key.algorithm, KEYSTORE)
    val info = factory.getKeySpec(key, KeyInfo::class.java) as KeyInfo
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      info.securityLevel == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT ||
        info.securityLevel == KeyProperties.SECURITY_LEVEL_STRONGBOX
    } else {
      @Suppress("DEPRECATION")
      info.isInsideSecureHardware
    }
  }.getOrDefault(false)

  private fun keyStore(): KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

  companion object {
    private const val KEYSTORE = "AndroidKeyStore"
    private const val ALIAS = "cp_device_action_key"
    private const val PREFS = "cp_action_key"
    private const val TAG = "CpActionKey"
  }
}
