package app.critterpass.deferredlink

import android.content.Context
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads the Play Install Referrer once per install. The web store button puts the link path in the
 * referrer (`cp_link=<path>`), so the first launch after an install from an invite lands on it
 * without typing. After the first read the gate stays closed: a later launch never re-applies an old
 * install's link.
 */
class CpDeferredLinkModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CpDeferredLink")

    AsyncFunction("getInstallReferrer") { promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      val gate = InstallReferrerGate(SharedPreferencesFlagStore(context))
      if (!gate.shouldRead()) {
        promise.resolve(null)
        return@AsyncFunction
      }
      readReferrer(context) { referrer ->
        gate.markRead()
        promise.resolve(referrer)
      }
    }

    // iOS-only check; Android's deferral is the referrer above.
    AsyncFunction("detectLikelyLink") { false }

    // A referrer a test run passes as a launch extra (Maestro `launchApp` arguments). JS asks for
    // it only in internal (non-production) variants.
    AsyncFunction("getReferrerOverride") {
      appContext.currentActivity?.intent?.getStringExtra(REFERRER_OVERRIDE_EXTRA)
    }
  }

  companion object {
    const val REFERRER_OVERRIDE_EXTRA = "cp_install_referrer"
  }

  private fun readReferrer(context: Context, done: (String?) -> Unit) {
    val client = InstallReferrerClient.newBuilder(context).build()
    var finished = false
    fun finish(value: String?) {
      if (finished) return
      finished = true
      runCatching { client.endConnection() }
      done(value)
    }
    client.startConnection(object : InstallReferrerStateListener {
      override fun onInstallReferrerSetupFinished(responseCode: Int) {
        val referrer =
          if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
            runCatching { client.installReferrer.installReferrer }.getOrNull()
          } else {
            null
          }
        finish(referrer?.takeIf { it.isNotBlank() })
      }

      override fun onInstallReferrerServiceDisconnected() {
        finish(null)
      }
    })
  }
}

/** Where the "already read" flag lives; SharedPreferences on device, in memory in tests. */
interface FlagStore {
  fun isSet(key: String): Boolean
  fun set(key: String)
}

class SharedPreferencesFlagStore(context: Context) : FlagStore {
  private val prefs = context.getSharedPreferences("cp_deferred_link", Context.MODE_PRIVATE)
  override fun isSet(key: String) = prefs.getBoolean(key, false)
  override fun set(key: String) {
    prefs.edit().putBoolean(key, true).apply()
  }
}

/** The once-per-install rule for the referrer read. */
class InstallReferrerGate(private val store: FlagStore) {
  fun shouldRead(): Boolean = !store.isSet(READ_KEY)
  fun markRead() = store.set(READ_KEY)

  companion object {
    const val READ_KEY = "install_referrer_read"
  }
}
