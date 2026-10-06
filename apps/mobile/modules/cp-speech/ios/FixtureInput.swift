#if DEBUG || CP_SPEECH_FIXTURES
  @preconcurrency import AVFAudio
  import Foundation

  /// Replays a WAV file in real time as if it were the echo-cancelled mic, for simulator and
  /// Maestro runs that have no microphone. Only debug and development-variant builds compile it
  /// (CpSpeech.podspec sets CP_SPEECH_FIXTURES for APP_VARIANT=development).
  final class FixtureInput: @unchecked Sendable {
    private let lock = NSLock()
    private var timer: DispatchSourceTimer?

    /// Starts feeding 20 ms buffers to `onBuffer`; `onEnd` runs once the file is exhausted.
    func start(
      url: URL, onBuffer: @escaping @Sendable (AVAudioPCMBuffer) -> Void,
      onEnd: @escaping @Sendable () -> Void
    ) throws {
      stop()
      let file = try AVAudioFile(forReading: url)
      let format = file.processingFormat
      let frames = AVAudioFrameCount(format.sampleRate / 50)
      let queue = DispatchQueue(label: "app.critterpass.speech.fixture", qos: .userInitiated)
      let source = DispatchSource.makeTimerSource(queue: queue)
      nonisolated(unsafe) let reader = file
      source.schedule(deadline: .now(), repeating: .milliseconds(20), leeway: .milliseconds(2))
      source.setEventHandler { [weak self] in
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames),
          (try? reader.read(into: buffer, frameCount: frames)) != nil, buffer.frameLength > 0
        else {
          self?.stop()
          onEnd()
          return
        }
        onBuffer(buffer)
      }
      lock.withLock { timer = source }
      source.resume()
    }

    func stop() {
      let source = lock.withLock { () -> DispatchSourceTimer? in
        defer { timer = nil }
        return timer
      }
      source?.cancel()
    }
  }
#endif
