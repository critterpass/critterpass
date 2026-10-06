package app.critterpass.speech

import android.content.Context
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Voice mode for the JS layer (modules/cp-speech/index.ts): listening with the on-device
 * SpeechRecognizer (Android 13+, fed from our echo-cancelled capture) or 16 kHz PCM frames for the
 * Deepgram client, mic level and speech start/end, and the spoken reply's chunk queue. Microphone
 * permission is asked by cp-permissions before the voice screen starts listening.
 */
class CpSpeechModule : Module() {
  private var session: SpeechSession? = null

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  private fun session(): SpeechSession =
    session ?: SpeechSession(context.applicationContext) { name, body -> sendEvent(name, body) }.also { session = it }

  override fun definition() = ModuleDefinition {
    Name("CpSpeech")

    Events(
      "onPartial",
      "onFinal",
      "onLevel",
      "onSpeechStart",
      "onSpeechEnd",
      "onPlayback",
      "onAudio",
      "onSession",
      "onFixtureEnd",
    )

    OnDestroy {
      session?.end()
      session = null
    }

    AsyncFunction("start") { locale: String, engine: String ->
      try {
        session().start(locale, if (engine == "stream") "stream" else "device")
      } catch (error: IllegalStateException) {
        throw CodedException("ERR_SPEECH_UNAVAILABLE", error.message ?: "speech unavailable", error)
      }
    }

    AsyncFunction("stop") { session?.stop() ?: Unit }

    AsyncFunction("isOnDeviceSupported") { locale: String, promise: Promise ->
      OnDeviceRecognizer.supports(context.applicationContext, locale) { promise.resolve(it) }
    }

    AsyncFunction("playChunks") { turn: String, chunks: List<Map<String, Any?>> ->
      val parsed =
        chunks.mapNotNull { chunk ->
          val seq = (chunk["seq"] as? Number)?.toInt() ?: return@mapNotNull null
          ReplyChunk(seq, chunk["url"] as? String, chunk["b64"] as? String)
        }
      session().playChunks(turn, parsed)
    }

    Function("cancelPlayback") { session?.reply?.cancel() ?: Unit }

    Function("setMuted") { muted: Boolean -> session().reply.setMuted(muted) }

    Function("outputVolume") { session().outputVolume() }

    Function("capabilities") {
      mapOf(
        "echoCancellation" to SpeechCapture.echoCancellation(),
        "fixtureInput" to SpeechCapture.FIXTURES,
      )
    }

    AsyncFunction("endSession") {
      session?.end()
      session = null
    }

    // Debug and development-variant builds only: a WAV file stands in for the mic.
    Function("setInputSource") { fixtureAudio: String? ->
      if (!SpeechCapture.FIXTURES) return@Function false
      if (fixtureAudio == null) {
        session().fixture = null
        return@Function true
      }
      val path = Uri.parse(fixtureAudio).takeIf { it.scheme == "file" }?.path ?: return@Function false
      session().fixture = File(path)
      true
    }
  }
}
