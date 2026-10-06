package app.critterpass.speech

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.os.Process
import android.os.SystemClock
import java.io.File

/**
 * The echo-cancelled mic: AudioRecord on VOICE_COMMUNICATION at 16 kHz mono 16-bit, with the
 * platform AcousticEchoCanceler and NoiseSuppressor attached where the device has them. Delivers
 * 20 ms frames on its own thread. In debug and development builds a WAV file can replace the mic,
 * replayed in real time.
 */
class SpeechCapture(private val context: Context, private val onFrame: (Frame) -> Unit) {
  class Frame(val samples: FloatArray, val pcm: ByteArray)

  @Volatile private var running = false
  private var thread: Thread? = null

  fun start(fixture: File?) {
    stop()
    running = true
    val source: () -> Unit =
      if (fixture != null && FIXTURES) ({ replay(WavReader.read(fixture.readBytes())) }) else ::record
    thread =
      Thread({
          Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
          source()
        }, "cp-speech-capture")
        .also { it.start() }
  }

  fun stop() {
    running = false
    thread?.let { if (it !== Thread.currentThread()) it.join(500) }
    thread = null
  }

  @SuppressLint("MissingPermission")
  private fun record() {
    if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
        PackageManager.PERMISSION_GRANTED) {
      running = false
      return
    }
    val minimum =
      AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val record =
      AudioRecord(
        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        maxOf(minimum, FRAME_BYTES * 4),
      )
    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      running = false
      return
    }
    val canceller =
      if (AcousticEchoCanceler.isAvailable()) AcousticEchoCanceler.create(record.audioSessionId) else null
    val suppressor =
      if (NoiseSuppressor.isAvailable()) NoiseSuppressor.create(record.audioSessionId) else null
    canceller?.setEnabled(true)
    suppressor?.setEnabled(true)
    try {
      record.startRecording()
      while (running) {
        val pcm = ByteArray(FRAME_BYTES)
        var filled = 0
        while (running && filled < FRAME_BYTES) {
          val read = record.read(pcm, filled, FRAME_BYTES - filled)
          if (read < 0) {
            running = false
            break
          }
          filled += read
        }
        if (filled == FRAME_BYTES) deliver(pcm)
      }
    } finally {
      record.stop()
      record.release()
      canceller?.release()
      suppressor?.release()
    }
  }

  private fun replay(audio: WavAudio) {
    val start = SystemClock.elapsedRealtime()
    var offset = 0
    var frame = 0L
    while (running && offset + FRAME_BYTES <= audio.pcm.size) {
      deliver(audio.pcm.copyOfRange(offset, offset + FRAME_BYTES))
      offset += FRAME_BYTES
      frame++
      val due = start + frame * FRAME_MS
      val wait = due - SystemClock.elapsedRealtime()
      if (wait > 0) Thread.sleep(wait)
    }
    if (running) onEnd?.invoke()
    running = false
  }

  /** Called on the capture thread when a fixture file runs out. */
  var onEnd: (() -> Unit)? = null

  private fun deliver(pcm: ByteArray) {
    val samples = FloatArray(FRAME_SAMPLES)
    Levels.fromPcm16(pcm, pcm.size, samples)
    onFrame(Frame(samples, pcm))
  }

  companion object {
    const val RATE = 16_000
    const val FRAME_MS = 20
    const val FRAME_SAMPLES = RATE * FRAME_MS / 1000
    const val FRAME_BYTES = FRAME_SAMPLES * 2
    /** Debug and development-variant builds only (android/build.gradle). */
    val FIXTURES: Boolean = BuildConfig.DEBUG || BuildConfig.SPEECH_FIXTURES

    fun echoCancellation(): Boolean = AcousticEchoCanceler.isAvailable()
  }
}
