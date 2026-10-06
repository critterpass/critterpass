package app.critterpass.speech

import kotlin.math.log10
import kotlin.math.sqrt

/** Sample maths shared by the level meter, the VAD and the streaming engine's PCM frames. */
object Levels {
  fun rms(samples: FloatArray, count: Int = samples.size): Float {
    if (count == 0) return 0f
    var sum = 0f
    for (i in 0 until count) sum += samples[i] * samples[i]
    return sqrt(sum / count)
  }

  /** Level in dB full scale, floored at -100 for silence. */
  fun dbfs(samples: FloatArray, count: Int = samples.size): Float {
    val value = rms(samples, count)
    return if (value > 0.00001f) 20f * log10(value) else -100f
  }

  /** Sign changes per sample. */
  fun zeroCrossingRate(samples: FloatArray, count: Int = samples.size): Float {
    if (count < 2) return 0f
    var crossings = 0
    for (i in 1 until count) if ((samples[i - 1] >= 0f) != (samples[i] >= 0f)) crossings++
    return crossings.toFloat() / (count - 1)
  }

  /** The meter's 0..1 value: -60 dBFS and below is 0, 0 dBFS is 1. */
  fun meter(rms: Float): Float {
    if (rms <= 0.00001f) return 0f
    return ((20f * log10(rms) + 60f) / 60f).coerceIn(0f, 1f)
  }

  /** 16-bit PCM (little-endian) to floats. */
  fun fromPcm16(bytes: ByteArray, length: Int, out: FloatArray): Int {
    val samples = length / 2
    for (i in 0 until samples) {
      val lo = bytes[2 * i].toInt() and 0xFF
      val hi = bytes[2 * i + 1].toInt()
      out[i] = ((hi shl 8) or lo).toShort() / 32768f
    }
    return samples
  }
}

/** Emits one RMS reading per window (about 30 per second) from mono samples of any length. */
class LevelMeter(sampleRate: Int, perSecond: Int = 30) {
  private val window = maxOf(1, sampleRate / perSecond)
  private var sum = 0f
  private var count = 0

  fun process(samples: FloatArray, length: Int = samples.size): List<Float> {
    val readings = ArrayList<Float>(2)
    for (i in 0 until length) {
      sum += samples[i] * samples[i]
      count++
      if (count == window) {
        readings.add(sqrt(sum / window))
        sum = 0f
        count = 0
      }
    }
    return readings
  }
}
