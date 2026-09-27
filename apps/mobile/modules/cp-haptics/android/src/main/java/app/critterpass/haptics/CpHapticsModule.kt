package app.critterpass.haptics

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * `VibrationEffect.Composition` (docs/design-system.md §4) where the platform supports it
 * (API 30+); [isSupported] gates both `play` and the ramp so the JS side falls back to
 * `expo-haptics` impacts below that. `holdRamp`'s continuous ramp has no direct Android composition
 * equivalent, so [rampUpdate] re-issues a short one-shot waveform at the requested amplitude each
 * throttled tick instead — audibly/tactilely continuous at 30 Hz even though each call is discrete.
 */
class CpHapticsModule : Module() {
  /** "throttled 30 Hz" (T6 step 2). */
  private val rampThrottleMs = 1000L / 30L
  private var lastRampUpdateAtMs = 0L

  private val vibrator: Vibrator?
    get() {
      val context = appContext.reactContext ?: return null
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        manager?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
    }

  override fun definition() = ModuleDefinition {
    Name("CpHaptics")

    Function("isSupported") {
      isCompositionSupported()
    }

    Function("play") { patternId: String ->
      if (patternId == "sos") playSos()
    }

    Function("rampStart") {
      lastRampUpdateAtMs = 0L
    }

    Function("rampUpdate") { intensity: Double ->
      updateRamp(intensity)
    }

    Function("rampStop") {
      vibrator?.cancel()
    }
  }

  private fun isCompositionSupported(): Boolean {
    val vibrator = vibrator ?: return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
    return vibrator.areAllPrimitivesSupported(
      VibrationEffect.Composition.PRIMITIVE_CLICK,
      VibrationEffect.Composition.PRIMITIVE_THUD,
    )
  }

  /** "SOS break-through; bypasses quiet hours" — dot-dot-dot, dash-dash-dash, dot-dot-dot. */
  private fun playSos() {
    val vibrator = vibrator ?: return
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
    val composition = VibrationEffect.startComposition()
    for (primitive in sosPrimitives()) {
      composition.addPrimitive(primitive.primitiveId, primitive.scale, primitive.delayMillis)
    }
    vibrator.vibrate(composition.compose())
  }

  companion object {
    /** A `(primitiveId, scale, delayMillis)` triple per composition primitive. */
    data class SosPrimitive(val primitiveId: Int, val scale: Float, val delayMillis: Int)

    /**
     * The SOS pattern's raw primitive list — separated from [playSos] so [CpHapticsModuleTest] can
     * assert on pulse count/ordering without a real `Vibrator`/`VibrationEffect.Composition`.
     */
    fun sosPrimitives(): List<SosPrimitive> {
      val click = VibrationEffect.Composition.PRIMITIVE_CLICK
      val thud = VibrationEffect.Composition.PRIMITIVE_THUD
      return List(3) { SosPrimitive(click, 1.0f, 120) } +
        List(3) { SosPrimitive(thud, 1.0f, 200) } +
        List(3) { SosPrimitive(click, 1.0f, 120) }
    }
  }

  private fun updateRamp(intensity: Double) {
    val vibrator = vibrator ?: return
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val now = System.currentTimeMillis()
    if (now - lastRampUpdateAtMs < rampThrottleMs) return
    lastRampUpdateAtMs = now
    val amplitude = (intensity.coerceIn(0.0, 1.0) * 255).toInt().coerceIn(1, 255)
    vibrator.vibrate(VibrationEffect.createOneShot(rampThrottleMs, amplitude))
  }
}
