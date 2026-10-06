package app.critterpass.speech

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.util.Base64
import java.io.File

/**
 * The voice session: MODE_IN_COMMUNICATION with transient ducking focus, the echo-cancelled
 * capture feeding the level meter, the VAD and either the on-device recogniser or 100 ms PCM
 * frames for the JS streaming client, and the reply player. Mirrors ios/SpeechAudio.swift.
 */
class SpeechSession(
  private val context: Context,
  private val emit: (name: String, body: Map<String, Any?>) -> Unit,
) {
  val reply =
    ReplyPlayer(context) { state, turn, seq ->
      emit("onPlayback", mapOf("state" to state, "turn" to turn, "seq" to seq).filterValues { it != null })
    }

  private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val lock = Any()
  private val capture = SpeechCapture(context, ::onFrame).also { it.onEnd = { emit("onFixtureEnd", emptyMap()) } }
  private val recognizer = OnDeviceRecognizer(context) { text, isFinal ->
    emit(if (isFinal) "onFinal" else "onPartial", mapOf("text" to text))
  }
  private var vad = Vad(SpeechCapture.RATE)
  private var meter = LevelMeter(SpeechCapture.RATE)
  private var engine: String? = null
  private val stream = java.io.ByteArrayOutputStream()
  private var focus: AudioFocusRequest? = null
  private var previousMode: Int? = null

  @Volatile
  var fixture: File? = null

  fun start(locale: String, engine: String) {
    stopCapture()
    enterCommunication()
    synchronized(lock) {
      this.engine = engine
      vad = Vad(SpeechCapture.RATE)
      meter = LevelMeter(SpeechCapture.RATE)
      stream.reset()
    }
    if (engine == "device") {
      check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        "On-device recognition from the echo-cancelled mic needs Android 13"
      }
      recognizer.start(locale)
    }
    capture.start(fixture?.takeIf { SpeechCapture.FIXTURES })
  }

  /** Ends listening; the on-device recogniser reports the whole utterance as `onFinal`. */
  fun stop() {
    val kind = synchronized(lock) { engine }
    stopCapture()
    when (kind) {
      "device" -> recognizer.finish()
      "stream" -> flushStream()
    }
  }

  fun playChunks(turn: String, chunks: List<ReplyChunk>): Boolean {
    if (reply.isMuted) return false
    enterCommunication()
    return reply.play(turn, chunks)
  }

  fun outputVolume(): Double {
    val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    return if (max > 0) audio.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max else 0.0
  }

  /** Leaves voice mode: stops everything and gives the audio back to other apps. */
  fun end() {
    stopCapture()
    recognizer.cancel()
    reply.release()
    leaveCommunication()
  }

  private fun stopCapture() {
    capture.stop()
    synchronized(lock) { engine = null }
  }

  /** Runs on the capture thread for every 20 ms frame. */
  private fun onFrame(frame: SpeechCapture.Frame) {
    val playing = reply.isActive
    val (events, readings, kind) =
      synchronized(lock) {
        vad.playing = playing
        Triple(vad.process(frame.samples), meter.process(frame.samples), engine)
      }
    if (kind == null) return
    for (rms in readings) emit("onLevel", mapOf("rms" to rms.toDouble(), "level" to Levels.meter(rms).toDouble()))
    for (event in events) {
      when (event) {
        is VadEvent.SpeechStart -> emit("onSpeechStart", mapOf("playing" to playing, "atMs" to event.atMs))
        is VadEvent.SpeechEnd -> emit("onSpeechEnd", mapOf("atMs" to event.atMs))
      }
    }
    if (kind == "device") {
      recognizer.write(frame.pcm)
      return
    }
    val full =
      synchronized(lock) {
        stream.write(frame.pcm)
        if (stream.size() < STREAM_FRAME_BYTES) null else stream.toByteArray().also { stream.reset() }
      }
    full?.let { emit("onAudio", mapOf("pcm" to Base64.encodeToString(it, Base64.NO_WRAP))) }
  }

  private fun flushStream() {
    val rest = synchronized(lock) { stream.toByteArray().also { stream.reset() } }
    if (rest.isNotEmpty()) emit("onAudio", mapOf("pcm" to Base64.encodeToString(rest, Base64.NO_WRAP)))
  }

  private fun enterCommunication() {
    if (previousMode != null) return
    previousMode = audio.mode
    audio.mode = AudioManager.MODE_IN_COMMUNICATION
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request =
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
          .setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build()
          )
          .build()
      audio.requestAudioFocus(request)
      focus = request
    }
  }

  private fun leaveCommunication() {
    val mode = previousMode ?: return
    previousMode = null
    audio.mode = mode
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) focus?.let { audio.abandonAudioFocusRequest(it) }
    focus = null
  }

  private companion object {
    /** 100 ms of 16 kHz 16-bit mono per `onAudio` frame. */
    const val STREAM_FRAME_BYTES = 3_200
  }
}
