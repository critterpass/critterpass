package app.critterpass.speech

import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WavReaderTest {
  private fun wav(rate: Int, channels: Int, samples: ShortArray): ByteArray {
    val data = samples.size * 2
    val buffer = ByteBuffer.allocate(44 + data).order(ByteOrder.LITTLE_ENDIAN)
    buffer.put("RIFF".toByteArray()).putInt(36 + data).put("WAVE".toByteArray())
    buffer.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(channels.toShort())
    buffer.putInt(rate).putInt(rate * channels * 2).putShort((channels * 2).toShort()).putShort(16)
    buffer.put("data".toByteArray()).putInt(data)
    samples.forEach { buffer.putShort(it) }
    return buffer.array()
  }

  private fun shorts(pcm: ByteArray): List<Short> {
    val buffer = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN)
    return List(pcm.size / 2) { buffer.getShort(it * 2) }
  }

  @Test
  fun keeps16kMonoAsIs() {
    val audio = WavReader.read(wav(16_000, 1, shortArrayOf(1, -2, 300)))
    assertEquals(16_000, audio.sampleRate)
    assertEquals(listOf<Short>(1, -2, 300), shorts(audio.pcm))
  }

  @Test
  fun averagesStereoAndResamplesTo16k() {
    val stereo = ShortArray(3_200) { if (it % 2 == 0) 1000 else 3000 }
    val audio = WavReader.read(wav(32_000, 2, stereo))
    val out = shorts(audio.pcm)
    assertEquals(800, out.size)
    assertTrue(out.all { it == 2000.toShort() })
  }

  @Test
  fun rejectsWhatIsNotAWav() {
    val failed = runCatching { WavReader.read("not a wav file at all".toByteArray()) }.isFailure
    assertTrue(failed)
  }

  @Test
  fun matchesRecogniserLanguagesByTagThenLanguage() {
    assertTrue(LocaleMatch.matches(listOf("en-US", "vi-VN"), "vi-VN"))
    assertTrue(LocaleMatch.matches(listOf("en-US", "vi-VN"), "vi"))
    assertTrue(LocaleMatch.matches(listOf("id_ID"), "id-ID"))
    assertFalse(LocaleMatch.matches(listOf("en-US"), "th-TH"))
  }
}
