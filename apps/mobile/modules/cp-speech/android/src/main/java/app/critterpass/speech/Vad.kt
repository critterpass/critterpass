package app.critterpass.speech

/** Tuning for [Vad], identical on both platforms (ios/Vad.swift). */
data class VadConfig(
  /** Analysis frame length. */
  val frameMs: Int = 20,
  /** Speech frames in a row before speech start (80 ms). */
  val onsetFrames: Int = 4,
  /** The same while our own reply plays (120 ms). */
  val playingOnsetFrames: Int = 6,
  /** Quiet frames after speech before speech end (300 ms). */
  val hangoverFrames: Int = 15,
  /** A frame is speech-loud this far above the tracked noise floor. */
  val marginDb: Float = 12f,
  /** The stricter margin while our reply plays. */
  val playingMarginDb: Float = 15f,
  /** Nothing quieter than this is speech, whatever the floor. */
  val minSpeechDb: Float = -50f,
  /** Zero crossings per sample that speech falls between: mains hum sits below, hiss above. */
  val minZcr: Float = 0.01f,
  val maxZcr: Float = 0.35f,
  /** When our reply starts, this many frames only learn its residual level (300 ms). */
  val playbackWarmupFrames: Int = 15,
)

sealed class VadEvent {
  data class SpeechStart(val atMs: Int) : VadEvent()

  data class SpeechEnd(val atMs: Int) : VadEvent()
}

/**
 * Energy and zero-crossing voice activity detector with onset and hangover, run on the
 * echo-cancelled mic signal. The noise floor follows the room while nobody speaks, so steady noise
 * and the canceller's residual of our own reply stay below it. Not thread-safe: one capture thread.
 */
class Vad(val sampleRate: Int, val config: VadConfig = VadConfig()) {
  /** True while our reply plays: stricter onset and margin, the floor holds through sentence gaps. */
  var playing: Boolean = false
    set(value) {
      if (value && !field) warmup = config.playbackWarmupFrames
      field = value
    }

  var inSpeech: Boolean = false
    private set

  var floorDb: Float = -60f
    private set

  private val frameSize = maxOf(1, sampleRate * config.frameMs / 1000)
  private val pending = FloatArray(frameSize)
  private var filled = 0
  private var run = 0
  private var quiet = 0
  private var processed = 0L
  private var warmup = 0

  fun reset() {
    filled = 0
    inSpeech = false
    floorDb = -60f
    run = 0
    quiet = 0
    processed = 0
    warmup = if (playing) config.playbackWarmupFrames else 0
  }

  /** Feeds mono samples (-1..1) of any length; returns the transitions they complete. */
  fun process(samples: FloatArray, count: Int = samples.size): List<VadEvent> {
    val events = ArrayList<VadEvent>(1)
    var index = 0
    while (index < count) {
      val take = minOf(frameSize - filled, count - index)
      System.arraycopy(samples, index, pending, filled, take)
      filled += take
      index += take
      if (filled == frameSize) {
        frame()?.let { events.add(it) }
        filled = 0
      }
    }
    return events
  }

  private fun frame(): VadEvent? {
    processed += frameSize
    val atMs = (processed * 1000 / sampleRate).toInt()
    val db = Levels.dbfs(pending, frameSize)
    val zcr = Levels.zeroCrossingRate(pending, frameSize)
    val margin = if (playing) config.playingMarginDb else config.marginDb
    val voiced =
      db >= config.minSpeechDb && db >= floorDb + margin && zcr >= config.minZcr &&
        zcr <= config.maxZcr

    if (warmup > 0) {
      warmup -= 1
      floorDb += (db - floorDb) * (if (db < floorDb) 0.3f else 0.2f)
      return null
    }
    if (!inSpeech && !voiced) {
      // Rise slowly; fall fast, except while our reply plays, when its residual must still count
      // in the short gaps between sentences.
      val rate = if (db >= floorDb) 0.05f else if (playing) 0.02f else 0.3f
      floorDb += (db - floorDb) * rate
    }

    if (inSpeech) {
      quiet = if (voiced) 0 else quiet + 1
      if (quiet >= config.hangoverFrames) {
        inSpeech = false
        quiet = 0
        run = 0
        return VadEvent.SpeechEnd(atMs)
      }
      return null
    }
    run = if (voiced) run + 1 else 0
    if (run >= (if (playing) config.playingOnsetFrames else config.onsetFrames)) {
      inSpeech = true
      run = 0
      quiet = 0
      return VadEvent.SpeechStart(atMs)
    }
    return null
  }
}
