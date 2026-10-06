package app.critterpass.speech

import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin

/** Deterministic stand-ins for what the echo-cancelled mic hears (same as ios/Tests/TestSignals.swift). */
object TestSignals {
  const val RATE = 16_000

  /** A voiced talker: vowel-shaped harmonics of [pitch], swelling by about 8 dB four times a second. */
  fun voice(seconds: Double, pitch: Double, peakDb: Float, phase: Double = 0.0): FloatArray {
    val gain = 10.0.pow(peakDb / 20.0)
    return FloatArray((seconds * RATE).toInt()) { index ->
      val t = index.toDouble() / RATE
      var value = 0.0
      for (harmonic in 1..12) {
        val frequency = pitch * harmonic
        val formant = exp(-((frequency - 700) / 500).pow(2)) + 0.5 * exp(-((frequency - 1200) / 400).pow(2))
        value += (0.15 + formant) * sin(2 * PI * frequency * t + phase * harmonic)
      }
      val syllable = 0.7 + 0.3 * sin(2 * PI * 4 * t + phase)
      (value / 4 * syllable * gain * 1.1).toFloat()
    }
  }

  /** Steady room noise (linear congruential, so every run is identical). */
  fun noise(seconds: Double, db: Float, seed: Int = 7): FloatArray {
    var state = seed
    val gain = 10.0.pow(db / 20.0).toFloat() * 1.7f
    return FloatArray((seconds * RATE).toInt()) {
      state = state * 1_664_525 + 1_013_904_223
      ((state ushr 8).toFloat() / (1 shl 24) - 0.5f) * gain
    }
  }

  fun silence(seconds: Double) = FloatArray((seconds * RATE).toInt())

  fun mix(a: FloatArray, b: FloatArray) =
    FloatArray(maxOf(a.size, b.size)) { (if (it < a.size) a[it] else 0f) + (if (it < b.size) b[it] else 0f) }
}
