@preconcurrency import AVFAudio
import Foundation

/// Which recogniser hears the mic: SpeechAnalyzer on device, or the JS streaming client
/// (`onAudio` frames of 16 kHz PCM) for locales the device cannot transcribe.
enum ListenEngine: String, Sendable {
  case device
  case stream
}

/// The voice session: `playAndRecord` + `.voiceChat` (voice-processing I/O, so the mic signal is
/// echo-cancelled against our own reply), one engine for capture and reply playback, the level
/// meter and VAD on every capture buffer, route and interruption handling.
final class SpeechAudio: @unchecked Sendable {
  typealias Emit = @Sendable (_ name: String, _ body: [String: Any]) -> Void

  static let streamFormat = AVAudioFormat(
    commonFormat: .pcmFormatFloat32, sampleRate: 16_000, channels: 1, interleaved: false)!
  /// 100 ms of 16 kHz audio per `onAudio` frame.
  private static let streamFrameSamples = 1_600

  let reply = ReplyPlayer()
  private let engine = AVAudioEngine()
  private let transcription = SpeechTranscription()
  private let lock = NSLock()
  private var emit: Emit?
  private var tapInstalled = false
  private var listening: ListenEngine?
  private var vad: Vad?
  private var meter: LevelMeter?
  private var streamConverter: AVAudioConverter?
  private var streamSamples: [Float] = []
  private var observers: [NSObjectProtocol] = []
  private var fixtureURL: URL?
  #if DEBUG || CP_SPEECH_FIXTURES
    private let fixture = FixtureInput()
  #endif

  func setEmitter(_ emit: Emit?) {
    lock.withLock { self.emit = emit }
    reply.setStateHandler { [weak self] state, turn, seq in
      var body: [String: Any] = ["state": state]
      if let turn { body["turn"] = turn }
      if let seq { body["seq"] = seq }
      self?.send("onPlayback", body)
    }
  }

  /// Debug builds only: replay a WAV file instead of the mic. Nil returns to the mic.
  func setFixture(_ url: URL?) {
    #if DEBUG || CP_SPEECH_FIXTURES
      lock.withLock { fixtureURL = url }
    #endif
  }

  var outputVolume: Float { AVAudioSession.sharedInstance().outputVolume }

  func start(locale: String, engine kind: ListenEngine) async throws {
    await stopCapture()
    let fixture = lock.withLock { fixtureURL }
    try prepare(mic: fixture == nil)
    lock.withLock {
      listening = kind
      vad = nil
      meter = nil
      streamConverter = nil
      streamSamples = []
    }
    if kind == .device {
      try await transcription.start(locale: locale) { [weak self] text, isFinal in
        self?.send(isFinal ? "onFinal" : "onPartial", ["text": text])
      }
    }
    if let fixture {
      #if DEBUG || CP_SPEECH_FIXTURES
        try self.fixture.start(
          url: fixture, onBuffer: { [weak self] in self?.capture($0) },
          onEnd: { [weak self] in self?.send("onFixtureEnd", [:]) })
      #endif
    } else {
      installTap()
    }
  }

  /// Ends listening; the on-device recogniser reports the whole utterance as `onFinal`.
  func stop() async {
    let kind = lock.withLock { listening }
    await stopCapture()
    if kind == .device { await transcription.finish() }
    if kind == .stream { flushStream() }
  }

  func playChunks(turn: String, chunks: [ReplyChunk]) throws -> Bool {
    if reply.isMuted { return false }
    let fixture = lock.withLock { fixtureURL }
    try prepare(mic: fixture == nil && AVAudioApplication.shared.recordPermission == .granted)
    return reply.play(turn: turn, chunks: chunks)
  }

  /// Leaves voice mode: stops everything and gives the audio back to other apps.
  func endSession() async {
    await stopCapture()
    await transcription.cancel()
    reply.cancel()
    lock.withLock {
      if engine.isRunning { engine.stop() }
      observers.forEach { NotificationCenter.default.removeObserver($0) }
      observers = []
    }
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func prepare(mic: Bool) throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(
      .playAndRecord, mode: .voiceChat,
      options: [.duckOthers, .allowBluetoothA2DP, .defaultToSpeaker])
    try session.setActive(true)
    try lock.withLock {
      if observers.isEmpty { observe() }
      if mic && !engine.inputNode.isVoiceProcessingEnabled {
        if engine.isRunning { engine.stop() }
        try engine.inputNode.setVoiceProcessingEnabled(true)
      }
      if reply.node.engine == nil {
        engine.attach(reply.node)
        engine.connect(reply.node, to: engine.mainMixerNode, format: reply.format)
      }
      if !engine.isRunning {
        engine.prepare()
        try engine.start()
      }
    }
  }

  private func installTap() {
    lock.withLock {
      guard !tapInstalled else { return }
      let input = engine.inputNode
      input.installTap(onBus: 0, bufferSize: 1_024, format: input.outputFormat(forBus: 0)) {
        [weak self] buffer, _ in self?.capture(buffer)
      }
      tapInstalled = true
    }
  }

  private func stopCapture() async {
    #if DEBUG || CP_SPEECH_FIXTURES
      fixture.stop()
    #endif
    lock.withLock {
      if tapInstalled { engine.inputNode.removeTap(onBus: 0) }
      tapInstalled = false
    }
  }

  /// Runs on the capture thread for every mic (or fixture) buffer.
  private func capture(_ buffer: AVAudioPCMBuffer) {
    let samples = AudioConversion.monoSamples(buffer)
    let rate = buffer.format.sampleRate
    let playing = reply.isActive
    let (events, readings, kind) = lock.withLock { () -> ([VadEvent], [Float], ListenEngine?) in
      if vad?.sampleRate != rate {
        vad = Vad(sampleRate: rate)
        meter = LevelMeter(sampleRate: rate)
      }
      vad?.playing = playing
      return (vad?.process(samples) ?? [], meter?.process(samples) ?? [], listening)
    }
    guard let kind else { return }
    for rms in readings { send("onLevel", ["rms": rms, "level": Levels.meter(rms)]) }
    for event in events {
      switch event {
      case .speechStart(let atMs): send("onSpeechStart", ["playing": playing, "atMs": atMs])
      case .speechEnd(let atMs): send("onSpeechEnd", ["atMs": atMs])
      }
    }
    switch kind {
    case .device: transcription.append(buffer)
    case .stream: stream(buffer)
    }
  }

  private func stream(_ buffer: AVAudioPCMBuffer) {
    let frames = lock.withLock { () -> [[Float]] in
      if streamConverter == nil || streamConverter?.inputFormat != buffer.format {
        streamConverter = AVAudioConverter(from: buffer.format, to: Self.streamFormat)
        streamConverter?.downmix = true
      }
      guard let converter = streamConverter,
        let converted = AudioConversion.convert(buffer, with: converter)
      else { return [] }
      streamSamples += AudioConversion.monoSamples(converted)
      var frames: [[Float]] = []
      while streamSamples.count >= Self.streamFrameSamples {
        frames.append(Array(streamSamples.prefix(Self.streamFrameSamples)))
        streamSamples.removeFirst(Self.streamFrameSamples)
      }
      return frames
    }
    for frame in frames { send("onAudio", ["pcm": Levels.pcm16(frame).base64EncodedString()]) }
  }

  private func flushStream() {
    let rest = lock.withLock { () -> [Float] in
      defer { streamSamples = [] }
      return streamSamples
    }
    if !rest.isEmpty { send("onAudio", ["pcm": Levels.pcm16(rest).base64EncodedString()]) }
  }

  private func send(_ name: String, _ body: [String: Any]) {
    let emit = lock.withLock { self.emit }
    emit?(name, body)
  }

  /// Must hold `lock`.
  private func observe() {
    let center = NotificationCenter.default
    observers = [
      center.addObserver(
        forName: AVAudioSession.interruptionNotification, object: nil, queue: nil
      ) { [weak self] note in
        let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt ?? 0
        let options = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
        self?.interrupted(
          began: AVAudioSession.InterruptionType(rawValue: raw) == .began,
          shouldResume: AVAudioSession.InterruptionOptions(rawValue: options).contains(
            .shouldResume))
      },
      center.addObserver(
        forName: AVAudioSession.routeChangeNotification, object: nil, queue: nil
      ) { [weak self] _ in
        self?.send("onSession", ["event": "route", "route": Self.route()])
      },
      center.addObserver(
        forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
      ) { [weak self] _ in
        self?.restartAfterConfigurationChange()
      },
      center.addObserver(
        forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: nil
      ) { [weak self] _ in
        self?.mediaServicesReset()
      },
    ]
  }

  private func interrupted(began: Bool, shouldResume: Bool) {
    guard began else {
      send("onSession", ["event": "resumed", "shouldResume": shouldResume])
      return
    }
    reply.cancel()
    Task { [weak self] in
      await self?.stopCapture()
      await self?.transcription.cancel()
      self?.lock.withLock { self?.listening = nil }
      self?.send("onSession", ["event": "interrupted"])
    }
  }

  /// A route change (headset in or out, Bluetooth) stops the engine and can change the input
  /// format: restart it and reinstall the tap in the new format.
  private func restartAfterConfigurationChange() {
    let (wasTapped, listening) = lock.withLock { () -> (Bool, ListenEngine?) in
      let wasTapped = tapInstalled
      if wasTapped { engine.inputNode.removeTap(onBus: 0) }
      tapInstalled = false
      vad = nil
      meter = nil
      streamConverter = nil
      if !engine.isRunning {
        engine.prepare()
        try? engine.start()
      }
      return (wasTapped, self.listening)
    }
    if wasTapped && listening != nil { installTap() }
    send("onSession", ["event": "route", "route": Self.route()])
  }

  private func mediaServicesReset() {
    reply.cancel()
    lock.withLock {
      tapInstalled = false
      listening = nil
      if engine.isRunning { engine.stop() }
      observers.forEach { NotificationCenter.default.removeObserver($0) }
      observers = []
    }
    send("onSession", ["event": "reset"])
  }

  private static func route() -> String {
    AVAudioSession.sharedInstance().currentRoute.outputs.first?.portType.rawValue ?? "none"
  }
}
