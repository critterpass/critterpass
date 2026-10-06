package app.critterpass.surfaces.hub

import android.content.Context
import android.os.Build

/** Runs [KeyguardRule] against this device. */
object KeyguardProbe {
  fun supported(context: Context): Boolean =
    KeyguardRule.supported(Build.VERSION.SDK_INT, sdkIntFull(), context.resources.configuration.smallestScreenWidthDp)

  /** `Build.VERSION.SDK_INT_FULL` (API 36+), read reflectively so the module builds on every SDK. */
  private fun sdkIntFull(): Int? =
    runCatching { Build.VERSION::class.java.getField("SDK_INT_FULL").getInt(null) }.getOrNull()
}
