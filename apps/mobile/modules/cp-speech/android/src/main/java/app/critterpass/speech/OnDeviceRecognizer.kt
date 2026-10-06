package app.critterpass.speech

import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.speech.RecognitionListener
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.annotation.TargetApi
import java.io.IOException
import java.io.OutputStream

/**
 * On-device SpeechRecognizer fed from our own echo-cancelled capture through a pipe
 * (EXTRA_AUDIO_SOURCE, API 33), so level, VAD and recognition hear the same signal and a fixture
 * WAV reaches the recogniser too. SpeechRecognizer lives on the main thread; [write] is called
 * from the capture thread.
 */
class OnDeviceRecognizer(
  private val context: Context,
  private val onText: (text: String, isFinal: Boolean) -> Unit,
) {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  @Volatile private var sink: OutputStream? = null

  @TargetApi(Build.VERSION_CODES.TIRAMISU)
  fun start(locale: String) {
    cancel()
    val (read, write) = ParcelFileDescriptor.createPipe()
    sink = ParcelFileDescriptor.AutoCloseOutputStream(write)
    val intent =
      recognizeIntent(locale).apply {
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, read)
        putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
        putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
        putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, SpeechCapture.RATE)
      }
    main.post {
      val created = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      created.setRecognitionListener(listener)
      created.startListening(intent)
      recognizer = created
      read.close()
    }
  }

  fun write(pcm: ByteArray) {
    val out = sink ?: return
    try {
      out.write(pcm)
    } catch (_: IOException) {
      sink = null
    }
  }

  /** Ends the audio: the recogniser finalizes and reports the utterance through `onResults`. */
  fun finish() {
    closeSink()
  }

  fun cancel() {
    closeSink()
    main.post {
      recognizer?.cancel()
      recognizer?.destroy()
      recognizer = null
    }
  }

  private fun closeSink() {
    val out = sink
    sink = null
    try {
      out?.close()
    } catch (_: IOException) {}
  }

  private val listener =
    object : RecognitionListener {
      override fun onPartialResults(partialResults: Bundle) {
        first(partialResults)?.let { onText(it, false) }
      }

      override fun onResults(results: Bundle) {
        onText(first(results) ?: "", true)
        recognizer?.destroy()
        recognizer = null
      }

      override fun onError(error: Int) {
        onText("", true)
        recognizer?.destroy()
        recognizer = null
      }

      override fun onReadyForSpeech(params: Bundle?) {}

      override fun onBeginningOfSpeech() {}

      override fun onRmsChanged(rmsdB: Float) {}

      override fun onBufferReceived(buffer: ByteArray?) {}

      override fun onEndOfSpeech() {}

      override fun onEvent(eventType: Int, params: Bundle?) {}
    }

  private fun first(bundle: Bundle): String? =
    bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()

  companion object {
    fun recognizeIntent(locale: String): Intent =
      Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      }

    /** True when the on-device recogniser has (or can download) a model for [locale]. */
    fun supports(context: Context, locale: String, answer: (Boolean) -> Unit) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
          !SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
        answer(false)
        return
      }
      Handler(Looper.getMainLooper()).post { check(context, locale, answer) }
    }

    @TargetApi(Build.VERSION_CODES.TIRAMISU)
    private fun check(context: Context, locale: String, answer: (Boolean) -> Unit) {
      val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      recognizer.checkRecognitionSupport(
        recognizeIntent(locale),
        context.mainExecutor,
        object : RecognitionSupportCallback {
          override fun onSupportResult(support: RecognitionSupport) {
            val tags = support.installedOnDeviceLanguages + support.supportedOnDeviceLanguages
            answer(LocaleMatch.matches(tags, locale))
            recognizer.destroy()
          }

          override fun onError(error: Int) {
            answer(false)
            recognizer.destroy()
          }
        },
      )
    }
  }
}

/** BCP 47 matching for recogniser language lists: exact tag, else the same language. */
object LocaleMatch {
  fun matches(tags: List<String>, locale: String): Boolean {
    val wanted = locale.replace('_', '-').lowercase()
    val language = wanted.substringBefore('-')
    val normalised = tags.map { it.replace('_', '-').lowercase() }
    return normalised.any { it == wanted } || normalised.any { it.substringBefore('-') == language }
  }
}
