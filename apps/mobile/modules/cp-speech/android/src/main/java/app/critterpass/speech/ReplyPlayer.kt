package app.critterpass.speech

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Base64
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import java.io.File
import java.util.UUID

/** One audio chunk of a spoken reply, as the turn stream sends it: a URL or base64 MP3 data. */
class ReplyChunk(val seq: Int, val url: String?, val b64: String?)

/**
 * Plays a reply's chunks in order with media3 ExoPlayer (the same library expo-audio ships) on the
 * voice-communication usage, so the echo canceller has it as its reference. Everything runs on
 * the main thread; [isActive] is read by the capture thread for the VAD.
 */
class ReplyPlayer(
  private val context: Context,
  private val onState: (state: String, turn: String?, seq: Int?) -> Unit,
) {
  private val main = Handler(Looper.getMainLooper())
  private val queue = ChunkQueue<ReplyChunk>()
  private val files = ArrayList<File>()
  private var player: ExoPlayer? = null
  private var started = false

  @Volatile
  var isActive = false
    private set

  @Volatile
  var isMuted = false
    private set

  fun setMuted(muted: Boolean) {
    isMuted = muted
    if (muted) cancel()
  }

  /** Queues chunks of [turn]; false when muted (the reply is shown as text only). */
  fun play(turn: String, chunks: List<ReplyChunk>): Boolean {
    if (isMuted) return false
    main.post { enqueue(turn, chunks) }
    return true
  }

  fun cancel() {
    main.post { stopAll(report = true) }
  }

  fun release() {
    main.post {
      stopAll(report = false)
      player?.release()
      player = null
    }
  }

  private fun enqueue(turn: String, chunks: List<ReplyChunk>) {
    if (isMuted) return
    // A newer turn supersedes whatever of the previous reply is still playing.
    if (queue.turn != null && queue.turn != turn && isActive) stopAll(report = true)
    if (queue.turn != turn) started = false
    val ready = chunks.sortedBy { it.seq }.flatMap { queue.push(turn, it.seq, it) }
    if (ready.isEmpty()) return
    val exo = player ?: create().also { player = it }
    for (chunk in ready) mediaItem(chunk)?.let { exo.addMediaItem(it) }
    if (exo.mediaItemCount == 0) return
    isActive = true
    when (exo.playbackState) {
      Player.STATE_IDLE -> exo.prepare()
      // Drained earlier: the playlist was cleared, so the first new chunk is item 0.
      Player.STATE_ENDED -> exo.seekToDefaultPosition(0)
      else -> {}
    }
    exo.play()
    if (!started) {
      started = true
      onState("started", turn, ready.first().seq)
    }
  }

  private fun mediaItem(chunk: ReplyChunk): MediaItem? {
    val b64 = chunk.b64 ?: return chunk.url?.let { MediaItem.fromUri(it) }
    val bytes =
      try {
        Base64.decode(b64, Base64.DEFAULT)
      } catch (_: IllegalArgumentException) {
        return null
      }
    val file = File(context.cacheDir, "cp-speech-${UUID.randomUUID()}.mp3")
    file.writeBytes(bytes)
    files.add(file)
    return MediaItem.fromUri(Uri.fromFile(file))
  }

  private fun create(): ExoPlayer {
    val attributes =
      AudioAttributes.Builder()
        .setUsage(C.USAGE_VOICE_COMMUNICATION)
        .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
        .build()
    // ExoPlayer manages focus only for media and game usages; the voice session asks for it.
    return ExoPlayer.Builder(context).build().apply {
      setAudioAttributes(attributes, false)
      addListener(
        object : Player.Listener {
          override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_ENDED) drained()
          }

          override fun onPlayerError(error: PlaybackException) {
            onState("error", queue.turn, null)
            drained()
          }
        }
      )
    }
  }

  private fun drained() {
    val exo = player ?: return
    exo.clearMediaItems()
    deleteFiles()
    isActive = false
    // The next chunk of the same turn (sent after a pause) reports `started` again.
    started = false
    onState("drained", queue.turn, null)
  }

  private fun stopAll(report: Boolean) {
    val wasActive = isActive
    val turn = queue.turn
    queue.cancel()
    isActive = false
    started = false
    player?.stop()
    player?.clearMediaItems()
    deleteFiles()
    if (report && wasActive) onState("cancelled", turn, null)
  }

  private fun deleteFiles() {
    files.forEach { it.delete() }
    files.clear()
  }
}
