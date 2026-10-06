package app.critterpass.speech

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VadTest {
  /** Feeds the signal in 10 ms buffers, like the capture callback. */
  private fun run(vad: Vad, samples: FloatArray): List<VadEvent> =
    (samples.indices step 160).flatMap { start ->
      vad.process(samples.copyOfRange(start, minOf(start + 160, samples.size)))
    }

  @Test
  fun roomNoiseAloneNeverStartsSpeech() {
    assertEquals(emptyList<VadEvent>(), run(Vad(TestSignals.RATE), TestSignals.noise(5.0, -55f)))
  }

  @Test
  fun speechStartsQuicklyAndEndsAfterTheHangover() {
    val signal =
      TestSignals.mix(
        TestSignals.noise(4.0, -60f),
        TestSignals.silence(1.0) + TestSignals.voice(1.5, 140.0, -22f),
      )
    val events = run(Vad(TestSignals.RATE), signal)
    assertEquals(2, events.size)
    val start = (events[0] as VadEvent.SpeechStart).atMs
    val end = (events[1] as VadEvent.SpeechEnd).atMs
    assertTrue("start $start", start in 1000..1150)
    assertTrue("end $end", end in 2500..2900)
  }

  @Test
  fun ownReplyResidualNeverStartsSpeechWhilePlaying() {
    val vad = Vad(TestSignals.RATE).apply { playing = true }
    val residual = TestSignals.mix(TestSignals.voice(6.0, 210.0, -45f), TestSignals.noise(6.0, -62f))
    assertEquals(emptyList<VadEvent>(), run(vad, TestSignals.silence(0.2) + residual))
  }

  @Test
  fun ownReplyWithPausesBetweenSentencesNeverStartsSpeech() {
    val vad = Vad(TestSignals.RATE).apply { playing = true }
    var residual = FloatArray(0)
    for (sentence in 0 until 5) {
      residual += TestSignals.voice(1.2, 210.0, -40f, sentence.toDouble())
      residual += TestSignals.silence(0.35)
    }
    assertEquals(emptyList<VadEvent>(), run(vad, TestSignals.mix(residual, TestSignals.noise(8.0, -62f))))
  }

  @Test
  fun userSpeakingOverTheReplyStartsSpeechWithin200Ms() {
    val vad = Vad(TestSignals.RATE).apply { playing = true }
    val residual = TestSignals.mix(TestSignals.voice(5.0, 210.0, -45f), TestSignals.noise(5.0, -62f))
    val user = TestSignals.silence(2.0) + TestSignals.voice(2.0, 130.0, -24f, 1.3)
    val start = (run(vad, TestSignals.mix(residual, user)).first() as VadEvent.SpeechStart).atMs
    assertTrue("barge-in at $start", start in 2000..2200)
  }

  @Test
  fun humAndHissAreNotSpeech() {
    val hum = FloatArray(TestSignals.RATE * 3) { (0.05 * kotlin.math.sin(2 * Math.PI * 50 * it / TestSignals.RATE)).toFloat() }
    assertEquals(emptyList<VadEvent>(), run(Vad(TestSignals.RATE), TestSignals.silence(0.5) + hum))
    assertEquals(
      emptyList<VadEvent>(),
      run(Vad(TestSignals.RATE), TestSignals.silence(0.5) + TestSignals.noise(3.0, -25f)),
    )
  }

  @Test
  fun levelMeterReportsThirtyReadingsASecond() {
    val readings = LevelMeter(TestSignals.RATE).process(TestSignals.voice(1.0, 140.0, -20f))
    assertEquals(30, readings.size)
    assertTrue(Levels.meter(readings.max()) > 0.4f)
    assertEquals(0f, Levels.meter(0f))
  }
}
