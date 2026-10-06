@preconcurrency import AVFAudio
import Foundation
import Speech

enum SpeechTranscriptionError: Error, CustomStringConvertible {
  case unsupportedLocale(String)
  case noAudioFormat

  var description: String {
    switch self {
    case .unsupportedLocale(let locale): return "On-device speech recognition has no \(locale) model"
    case .noAudioFormat: return "The speech model reported no audio format"
    }
  }
}

/// On-device transcription with SpeechAnalyzer + SpeechTranscriber (iOS 26). The capture callback
/// hands over echo-cancelled buffers in the mic's format; they are converted to the model's format
/// and streamed in. Volatile results become partials (everything finalized so far plus the volatile
/// tail); `finish` drains the model and reports the whole utterance once.
final class SpeechTranscription: @unchecked Sendable {
  typealias TextHandler = @Sendable (_ text: String, _ isFinal: Bool) -> Void

  private let lock = NSLock()
  private var input: AsyncStream<AnalyzerInput>.Continuation?
  private var analyzer: SpeechAnalyzer?
  private var results: Task<Void, Never>?
  private var converter: AVAudioConverter?
  private var targetFormat: AVAudioFormat?
  private var finalized = ""
  private var volatile = ""
  private var onText: TextHandler?

  /// True when this device can transcribe `identifier` on device (model installed or installable).
  static func supports(_ identifier: String) async -> Bool {
    guard SpeechTranscriber.isAvailable else { return false }
    return await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: identifier))
      != nil
  }

  func start(locale identifier: String, onText: @escaping TextHandler) async throws {
    await cancel()
    guard SpeechTranscriber.isAvailable,
      let locale = await SpeechTranscriber.supportedLocale(
        equivalentTo: Locale(identifier: identifier))
    else { throw SpeechTranscriptionError.unsupportedLocale(identifier) }

    let transcriber = SpeechTranscriber(
      locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults],
      attributeOptions: [])
    if let install = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
      try await install.downloadAndInstall()
    }
    guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])
    else { throw SpeechTranscriptionError.noAudioFormat }

    let analyzer = SpeechAnalyzer(modules: [transcriber])
    let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
    lock.withLock {
      self.analyzer = analyzer
      self.input = continuation
      self.targetFormat = format
      self.converter = nil
      self.finalized = ""
      self.volatile = ""
      self.onText = onText
    }
    let task = Task { [weak self] in
      do {
        for try await result in transcriber.results {
          self?.receive(String(result.text.characters), isFinal: result.isFinal)
        }
      } catch {
        // The stream ends with an error when the analysis is cancelled; the text so far stands.
      }
    }
    lock.withLock { results = task }
    try await analyzer.start(inputSequence: stream)
  }

  /// Called from the capture thread with the mic's buffer.
  func append(_ buffer: AVAudioPCMBuffer) {
    lock.withLock {
      guard let input, let targetFormat else { return }
      if buffer.format == targetFormat {
        input.yield(AnalyzerInput(buffer: buffer))
        return
      }
      if converter == nil || converter?.inputFormat != buffer.format {
        converter = AVAudioConverter(from: buffer.format, to: targetFormat)
      }
      guard let converter, let converted = AudioConversion.convert(buffer, with: converter) else {
        return
      }
      input.yield(AnalyzerInput(buffer: converted))
    }
  }

  /// Ends the utterance: the model finalizes what it heard, then the whole text is reported final.
  func finish() async {
    let (analyzer, input, results) = lock.withLock { (self.analyzer, self.input, self.results) }
    guard let analyzer else { return }
    input?.finish()
    try? await analyzer.finalizeAndFinishThroughEndOfInput()
    await results?.value
    let (text, handler) = lock.withLock { () -> (String, TextHandler?) in
      let text = Self.join(finalized, volatile)
      clear()
      return (text, onText)
    }
    handler?(text, true)
  }

  /// Drops the utterance without a final result.
  func cancel() async {
    let (analyzer, input, results) = lock.withLock { () -> (SpeechAnalyzer?, AsyncStream<AnalyzerInput>.Continuation?, Task<Void, Never>?) in
      defer { clear() }
      return (self.analyzer, self.input, self.results)
    }
    input?.finish()
    results?.cancel()
    await analyzer?.cancelAndFinishNow()
  }

  private func receive(_ text: String, isFinal: Bool) {
    let (partial, handler) = lock.withLock { () -> (String, TextHandler?) in
      if isFinal {
        finalized = Self.join(finalized, text)
        volatile = ""
      } else {
        volatile = text
      }
      return (Self.join(finalized, volatile), onText)
    }
    handler?(partial, false)
  }

  /// Must hold `lock`.
  private func clear() {
    analyzer = nil
    input = nil
    results = nil
    converter = nil
    targetFormat = nil
    finalized = ""
    volatile = ""
    onText = nil
  }

  private static func join(_ head: String, _ tail: String) -> String {
    let left = head.trimmingCharacters(in: .whitespaces)
    let right = tail.trimmingCharacters(in: .whitespaces)
    if left.isEmpty { return right }
    if right.isEmpty { return left }
    return "\(left) \(right)"
  }
}

/// Sample-rate and layout conversion for capture and reply buffers.
enum AudioConversion {
  static func convert(_ buffer: AVAudioPCMBuffer, with converter: AVAudioConverter)
    -> AVAudioPCMBuffer?
  {
    let ratio = converter.outputFormat.sampleRate / converter.inputFormat.sampleRate
    let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 32
    guard
      let output = AVAudioPCMBuffer(pcmFormat: converter.outputFormat, frameCapacity: capacity)
    else { return nil }
    nonisolated(unsafe) var supplied = false
    var error: NSError?
    let status = converter.convert(to: output, error: &error) { _, outStatus in
      if supplied {
        outStatus.pointee = .noDataNow
        return nil
      }
      supplied = true
      outStatus.pointee = .haveData
      return buffer
    }
    return status == .error || error != nil ? nil : output
  }

  /// The first channel as floats, whatever the buffer's sample format.
  static func monoSamples(_ buffer: AVAudioPCMBuffer) -> [Float] {
    let frames = Int(buffer.frameLength)
    if let channels = buffer.floatChannelData {
      return Array(UnsafeBufferPointer(start: channels[0], count: frames))
    }
    if let channels = buffer.int16ChannelData {
      return UnsafeBufferPointer(start: channels[0], count: frames).map {
        Float($0) / Float(Int16.max)
      }
    }
    return []
  }
}
