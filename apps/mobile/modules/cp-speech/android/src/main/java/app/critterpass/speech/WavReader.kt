package app.critterpass.speech

import java.nio.ByteBuffer
import java.nio.ByteOrder

/** A decoded WAV: mono 16-bit PCM at [sampleRate]. */
class WavAudio(val sampleRate: Int, val pcm: ByteArray)

/**
 * Reads the fixture WAVs that stand in for the mic (16-bit PCM, any rate, mono or stereo) and
 * returns mono 16 kHz PCM, the capture format. Stereo is averaged; other rates are resampled
 * linearly, which is plenty for recognition fixtures.
 */
object WavReader {
  const val TARGET_RATE = 16_000

  fun read(bytes: ByteArray): WavAudio {
    val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    require(bytes.size >= 12 && tag(bytes, 0) == "RIFF" && tag(bytes, 8) == "WAVE") {
      "not a WAV file"
    }
    var offset = 12
    var channels = 0
    var rate = 0
    var bits = 0
    var format = 0
    while (offset + 8 <= bytes.size) {
      val id = tag(bytes, offset)
      val size = buffer.getInt(offset + 4)
      val body = offset + 8
      if (id == "fmt ") {
        format = buffer.getShort(body).toInt()
        channels = buffer.getShort(body + 2).toInt()
        rate = buffer.getInt(body + 4)
        bits = buffer.getShort(body + 14).toInt()
      } else if (id == "data") {
        require(format == 1 && bits == 16 && channels in 1..2) { "fixture WAVs are 16-bit PCM" }
        val end = minOf(bytes.size, body + size)
        return WavAudio(TARGET_RATE, resample(mono(buffer, body, end, channels), rate))
      }
      offset = body + size + (size and 1)
    }
    throw IllegalArgumentException("WAV has no data chunk")
  }

  private fun tag(bytes: ByteArray, at: Int) = String(bytes, at, 4, Charsets.US_ASCII)

  private fun mono(buffer: ByteBuffer, start: Int, end: Int, channels: Int): ShortArray {
    val frames = (end - start) / (2 * channels)
    return ShortArray(frames) { frame ->
      var sum = 0
      for (c in 0 until channels) sum += buffer.getShort(start + 2 * (frame * channels + c))
      (sum / channels).toShort()
    }
  }

  private fun resample(samples: ShortArray, rate: Int): ByteArray {
    val count = if (rate == TARGET_RATE) samples.size else (samples.size.toLong() * TARGET_RATE / rate).toInt()
    val out = ByteBuffer.allocate(count * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (i in 0 until count) {
      val value =
        if (rate == TARGET_RATE) {
          samples[i].toInt()
        } else {
          val position = i.toDouble() * rate / TARGET_RATE
          val left = position.toInt().coerceAtMost(samples.size - 1)
          val right = (left + 1).coerceAtMost(samples.size - 1)
          val t = position - left
          (samples[left] * (1 - t) + samples[right] * t).toInt()
        }
      out.putShort(value.toShort())
    }
    return out.array()
  }
}
