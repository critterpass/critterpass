@preconcurrency import AVFAudio
import Foundation

/// One audio chunk of a spoken reply, as the turn stream sends it: a URL or base64 MP3 data.
struct ReplyChunk: Sendable {
  let seq: Int
  let url: String?
  let b64: String?
}

/// Plays a reply's chunks in order on the voice engine's player node, so the echo canceller hears
/// them as its reference. Chunks decode one at a time on a serial queue; `cancel` bumps the
/// generation, so anything decoded or scheduled for the old turn is dropped or stopped.
final class ReplyPlayer: @unchecked Sendable {
  typealias StateHandler = @Sendable (_ state: String, _ turn: String?, _ seq: Int?) -> Void

  let node = AVAudioPlayerNode()
  /// The format the node is connected with; decoded chunks are converted to it.
  let format: AVAudioFormat

  private let lock = NSLock()
  private let work = DispatchQueue(label: "app.critterpass.speech.reply", qos: .userInitiated)
  private var queue = ChunkQueue<ReplyChunk>()
  private var generation = 0
  private var outstanding = 0
  private var started = false
  private var muted = false
  private var onState: StateHandler?

  init() {
    format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
  }

  func setStateHandler(_ handler: StateHandler?) {
    lock.withLock { onState = handler }
  }

  /// True from the first queued chunk of a turn until it drains or is cancelled.
  var isActive: Bool { lock.withLock { outstanding > 0 } }

  var isMuted: Bool { lock.withLock { muted } }

  func setMuted(_ value: Bool) {
    lock.withLock { muted = value }
    if value { cancel() }
  }

  /// Queues chunks of `turn`; returns false when muted (the reply is shown as text only).
  @discardableResult
  func play(turn: String, chunks: [ReplyChunk]) -> Bool {
    // A newer turn supersedes whatever of the previous reply is still playing.
    if lock.withLock({ queue.turn != nil && queue.turn != turn && outstanding > 0 }) { cancel() }
    let (ready, generation, muted) = lock.withLock { () -> ([ReplyChunk], Int, Bool) in
      if muted { return ([], self.generation, true) }
      if queue.turn != turn { started = false }
      let ready = chunks.sorted { $0.seq < $1.seq }.flatMap {
        queue.push(turn: turn, seq: $0.seq, item: $0)
      }
      outstanding += ready.count
      return (ready, self.generation, false)
    }
    if muted { return false }
    for chunk in ready {
      work.async { [weak self] in self?.schedule(chunk, turn: turn, generation: generation) }
    }
    return true
  }

  func cancel() {
    let (turn, handler, wasActive) = lock.withLock { () -> (String?, StateHandler?, Bool) in
      let turn = queue.turn
      let wasActive = outstanding > 0
      generation += 1
      queue.cancel()
      outstanding = 0
      started = false
      return (turn, onState, wasActive)
    }
    node.stop()
    if wasActive { handler?("cancelled", turn, nil) }
  }

  private func schedule(_ chunk: ReplyChunk, turn: String, generation: Int) {
    guard isCurrent(generation) else { return }
    guard let buffer = decode(chunk) else {
      finished(turn: turn, seq: chunk.seq, generation: generation, failed: true)
      return
    }
    let (first, handler) = lock.withLock { () -> (Bool, StateHandler?) in
      guard self.generation == generation else { return (false, nil) }
      defer { started = true }
      return (!started, onState)
    }
    guard isCurrent(generation), node.engine?.isRunning == true else {
      finished(turn: turn, seq: chunk.seq, generation: generation, failed: true)
      return
    }
    node.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
      self?.finished(turn: turn, seq: chunk.seq, generation: generation, failed: false)
    }
    if !node.isPlaying { node.play() }
    if first { handler?("started", turn, chunk.seq) }
  }

  private func finished(turn: String, seq: Int, generation: Int, failed: Bool) {
    let (drained, handler) = lock.withLock { () -> (Bool, StateHandler?) in
      guard self.generation == generation else { return (false, nil) }
      outstanding = max(0, outstanding - 1)
      let drained = outstanding == 0 && queue.isEmpty
      // The next chunk of the same turn (sent after a pause) reports `started` again.
      if drained { started = false }
      return (drained, onState)
    }
    if failed { handler?("error", turn, seq) }
    if drained { handler?("drained", turn, seq) }
  }

  private func isCurrent(_ generation: Int) -> Bool {
    lock.withLock { self.generation == generation }
  }

  private func decode(_ chunk: ReplyChunk) -> AVAudioPCMBuffer? {
    guard let data = Self.load(chunk) else { return nil }
    let file = FileManager.default.temporaryDirectory
      .appendingPathComponent("cp-speech-\(UUID().uuidString).mp3")
    defer { try? FileManager.default.removeItem(at: file) }
    do {
      try data.write(to: file)
      let audio = try AVAudioFile(forReading: file)
      guard
        let decoded = AVAudioPCMBuffer(
          pcmFormat: audio.processingFormat, frameCapacity: AVAudioFrameCount(audio.length))
      else { return nil }
      try audio.read(into: decoded)
      if decoded.format == format { return decoded }
      guard let converter = AVAudioConverter(from: decoded.format, to: format) else { return nil }
      converter.downmix = true
      return AudioConversion.convert(decoded, with: converter)
    } catch {
      return nil
    }
  }

  private static func load(_ chunk: ReplyChunk) -> Data? {
    if let b64 = chunk.b64 { return Data(base64Encoded: b64) }
    guard let raw = chunk.url, let url = URL(string: raw) else { return nil }
    // A dedicated serial queue: blocking on the download keeps the chunks in order.
    return try? Data(contentsOf: url)
  }
}
