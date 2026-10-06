import Foundation

/// Tuning for `Vad`, identical on both platforms (android/.../Vad.kt).
public struct VadConfig: Sendable, Equatable {
  /// Analysis frame length.
  public var frameMs = 20
  /// Speech frames in a row before `speechStart` (80 ms).
  public var onsetFrames = 4
  /// The same while our own reply plays: the echo-cancelled residual must not start a turn (120 ms).
  public var playingOnsetFrames = 6
  /// Quiet frames after speech before `speechEnd` (300 ms): short pauses inside a sentence pass.
  public var hangoverFrames = 15
  /// A frame is speech-loud when it is this far above the tracked noise floor.
  public var marginDb: Float = 12
  /// The stricter margin while our reply plays.
  public var playingMarginDb: Float = 15
  /// Nothing quieter than this is speech, whatever the floor.
  public var minSpeechDb: Float = -50
  /// Zero crossings per sample that speech falls between: mains hum sits below, hiss above.
  public var minZcr: Float = 0.01
  public var maxZcr: Float = 0.35
  /// When our reply starts, this many frames only learn its residual level (300 ms).
  public var playbackWarmupFrames = 15

  public init() {}
}

public enum VadEvent: Equatable, Sendable {
  case speechStart(atMs: Int)
  case speechEnd(atMs: Int)
}

/// Energy and zero-crossing voice activity detector with onset and hangover, run on the
/// echo-cancelled mic signal. The noise floor follows the room while nobody speaks (falls fast,
/// rises slowly), so steady noise and the canceller's residual of our own reply stay below it.
public struct Vad: Sendable {
  public let config: VadConfig
  public let sampleRate: Double
  /// True while our reply plays: the stricter onset and margin apply, the floor holds through the
  /// pauses between sentences, and the first frames only learn the canceller's residual.
  public var playing = false {
    didSet { if playing && !oldValue { warmup = config.playbackWarmupFrames } }
  }
  public private(set) var inSpeech = false
  public private(set) var floorDb: Float = -60

  private let frameSize: Int
  private var pending: [Float] = []
  private var run = 0
  private var quiet = 0
  private var processed = 0
  private var warmup = 0

  public init(sampleRate: Double, config: VadConfig = VadConfig()) {
    self.sampleRate = sampleRate
    self.config = config
    frameSize = max(1, Int(sampleRate * Double(config.frameMs) / 1000))
    pending.reserveCapacity(frameSize)
  }

  public mutating func reset() {
    pending.removeAll(keepingCapacity: true)
    inSpeech = false
    floorDb = -60
    run = 0
    quiet = 0
    processed = 0
    warmup = playing ? config.playbackWarmupFrames : 0
  }

  /// Feeds mono samples (-1...1) of any length; returns the transitions they complete.
  public mutating func process(_ samples: [Float]) -> [VadEvent] {
    var events: [VadEvent] = []
    var index = 0
    while index < samples.count {
      let take = min(frameSize - pending.count, samples.count - index)
      pending.append(contentsOf: samples[index..<(index + take)])
      index += take
      if pending.count == frameSize {
        if let event = frame(pending) { events.append(event) }
        pending.removeAll(keepingCapacity: true)
      }
    }
    return events
  }

  private mutating func frame(_ frame: [Float]) -> VadEvent? {
    processed += frame.count
    let atMs = Int(Double(processed) * 1000 / sampleRate)
    let db = Levels.dbfs(frame)
    let zcr = Levels.zeroCrossingRate(frame)
    let margin = playing ? config.playingMarginDb : config.marginDb
    let voiced =
      db >= config.minSpeechDb && db >= floorDb + margin && zcr >= config.minZcr
      && zcr <= config.maxZcr

    if warmup > 0 {
      warmup -= 1
      floorDb += (db - floorDb) * (db < floorDb ? 0.3 : 0.2)
      return nil
    }
    if !inSpeech && !voiced {
      // Track the room while nobody speaks: rise slowly; fall fast, except while our reply plays,
      // when its residual must still count in the short gaps between sentences.
      let rate: Float = db >= floorDb ? 0.05 : (playing ? 0.02 : 0.3)
      floorDb += (db - floorDb) * rate
    }

    if inSpeech {
      quiet = voiced ? 0 : quiet + 1
      if quiet >= config.hangoverFrames {
        inSpeech = false
        quiet = 0
        run = 0
        return .speechEnd(atMs: atMs)
      }
      return nil
    }
    run = voiced ? run + 1 : 0
    if run >= (playing ? config.playingOnsetFrames : config.onsetFrames) {
      inSpeech = true
      run = 0
      quiet = 0
      return .speechStart(atMs: atMs)
    }
    return nil
  }
}
