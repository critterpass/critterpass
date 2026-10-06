import ExpoModulesCore
import Foundation

/// Voice mode for the JS layer (modules/cp-speech/index.ts): listening with on-device
/// SpeechAnalyzer or 16 kHz PCM frames for the streaming recogniser, mic level and speech
/// start/end from the echo-cancelled signal, and the spoken reply's chunk queue. The audio work
/// lives in `SpeechAudio`; events reach JS through `SpeechEventRelay`, which holds the module
/// weakly so the closures capture nothing but Sendable values. Microphone permission is asked by
/// cp-permissions before the voice screen starts listening.
public class CpSpeechModule: Module {
  private let audio = SpeechAudio()
  private let relay = SpeechEventRelay()

  public func definition() -> ModuleDefinition {
    let audio = self.audio
    let relay = self.relay

    Name("CpSpeech")

    Events(
      "onPartial", "onFinal", "onLevel", "onSpeechStart", "onSpeechEnd", "onPlayback", "onAudio",
      "onSession", "onFixtureEnd")

    OnCreate {
      relay.module = self
      audio.setEmitter { name, body in relay.send(name, body) }
    }

    OnDestroy {
      audio.setEmitter(nil)
      relay.module = nil
    }

    AsyncFunction("start") { (locale: String, engine: String) async throws in
      do {
        try await audio.start(locale: locale, engine: ListenEngine(rawValue: engine) ?? .device)
      } catch let error as SpeechTranscriptionError {
        throw Exception(
          name: "SpeechUnavailable", description: error.description, code: "ERR_SPEECH_UNAVAILABLE")
      } catch {
        throw Exception(
          name: "SpeechAudio", description: error.localizedDescription, code: "ERR_SPEECH_AUDIO")
      }
    }

    AsyncFunction("stop") { () async in
      await audio.stop()
    }

    AsyncFunction("isOnDeviceSupported") { (locale: String) async -> Bool in
      await SpeechTranscription.supports(locale)
    }

    AsyncFunction("playChunks") { (turn: String, chunks: [[String: Any]]) throws -> Bool in
      let parsed = chunks.compactMap { chunk -> ReplyChunk? in
        guard let seq = (chunk["seq"] as? NSNumber)?.intValue else { return nil }
        return ReplyChunk(seq: seq, url: chunk["url"] as? String, b64: chunk["b64"] as? String)
      }
      do {
        return try audio.playChunks(turn: turn, chunks: parsed)
      } catch {
        throw Exception(
          name: "SpeechAudio", description: error.localizedDescription, code: "ERR_SPEECH_AUDIO")
      }
    }

    Function("cancelPlayback") {
      audio.reply.cancel()
    }

    Function("setMuted") { (muted: Bool) in
      audio.reply.setMuted(muted)
    }

    Function("outputVolume") { () -> Double in
      Double(audio.outputVolume)
    }

    Function("capabilities") { () -> [String: Any] in
      ["echoCancellation": true, "fixtureInput": SpeechEventRelay.fixturesCompiled]
    }

    AsyncFunction("endSession") { () async in
      await audio.endSession()
    }

    // Debug and development-variant builds only: a WAV file stands in for the mic.
    Function("setInputSource") { (fixtureAudio: String?) -> Bool in
      guard SpeechEventRelay.fixturesCompiled else { return false }
      guard let fixtureAudio else {
        audio.setFixture(nil)
        return true
      }
      guard let url = URL(string: fixtureAudio), url.isFileURL else { return false }
      audio.setFixture(url)
      return true
    }
  }
}

/// Forwards native events to the module that owns them; safe to call from any thread.
final class SpeechEventRelay: @unchecked Sendable {
  #if DEBUG || CP_SPEECH_FIXTURES
    static let fixturesCompiled = true
  #else
    static let fixturesCompiled = false
  #endif

  private let lock = NSLock()
  private weak var owner: Module?

  var module: Module? {
    get { lock.withLock { owner } }
    set { lock.withLock { owner = newValue } }
  }

  func send(_ name: String, _ body: [String: Any]) {
    module?.sendEvent(name, body)
  }
}
