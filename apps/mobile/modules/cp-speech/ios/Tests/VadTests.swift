import XCTest

@testable import CpSpeechCore

final class VadTests: XCTestCase {
  private let rate = TestSignals.sampleRate

  /// Feeds the signal in 10 ms buffers, like the capture callback.
  private func run(_ vad: inout Vad, _ samples: [Float]) -> [VadEvent] {
    stride(from: 0, to: samples.count, by: 160).flatMap { start in
      vad.process(Array(samples[start..<min(start + 160, samples.count)]))
    }
  }

  func testRoomNoiseAloneNeverStartsSpeech() {
    var vad = Vad(sampleRate: rate)
    XCTAssertEqual(run(&vad, TestSignals.noise(seconds: 5, db: -55)), [])
  }

  func testSpeechStartsQuicklyAndEndsAfterTheHangover() {
    var vad = Vad(sampleRate: rate)
    let room = TestSignals.noise(seconds: 4, db: -60)
    let signal = TestSignals.mix(
      room,
      TestSignals.silence(seconds: 1) + TestSignals.voice(seconds: 1.5, pitch: 140, peakDb: -22))
    let events = run(&vad, signal)
    guard case .speechStart(let start)? = events.first else {
      return XCTFail("no speech start in \(events)")
    }
    XCTAssertGreaterThanOrEqual(start, 1000)
    XCTAssertLessThanOrEqual(start, 1150)
    guard events.count == 2, case .speechEnd(let end) = events[1] else {
      return XCTFail("expected one start and one end, got \(events)")
    }
    XCTAssertGreaterThanOrEqual(end, 2500)
    XCTAssertLessThanOrEqual(end, 2900)
  }

  func testOwnReplyResidualNeverStartsSpeechWhilePlaying() {
    var vad = Vad(sampleRate: rate)
    vad.playing = true
    // The guide's voice after echo cancellation: the same talker shape, about 30 dB down.
    let residual = TestSignals.mix(
      TestSignals.voice(seconds: 6, pitch: 210, peakDb: -45),
      TestSignals.noise(seconds: 6, db: -62))
    XCTAssertEqual(run(&vad, TestSignals.silence(seconds: 0.2) + residual), [])
  }

  func testOwnReplyWithPausesBetweenSentencesNeverStartsSpeech() {
    var vad = Vad(sampleRate: rate)
    vad.playing = true
    var residual: [Float] = []
    for sentence in 0..<5 {
      residual += TestSignals.voice(seconds: 1.2, pitch: 210, peakDb: -40, phase: Double(sentence))
      residual += TestSignals.silence(seconds: 0.35)
    }
    let signal = TestSignals.mix(residual, TestSignals.noise(seconds: 8, db: -62))
    XCTAssertEqual(run(&vad, signal), [])
  }

  func testUserSpeakingOverTheReplyStartsSpeechWithin200Ms() {
    var vad = Vad(sampleRate: rate)
    vad.playing = true
    let residual = TestSignals.mix(
      TestSignals.voice(seconds: 5, pitch: 210, peakDb: -45),
      TestSignals.noise(seconds: 5, db: -62))
    let user = TestSignals.silence(seconds: 2) + TestSignals.voice(seconds: 2, pitch: 130, peakDb: -24, phase: 1.3)
    let events = run(&vad, TestSignals.mix(residual, user))
    guard case .speechStart(let start)? = events.first else {
      return XCTFail("no barge-in in \(events)")
    }
    XCTAssertGreaterThanOrEqual(start, 2000)
    XCTAssertLessThanOrEqual(start, 2200)
  }

  func testHumAndHissAreNotSpeech() {
    var vad = Vad(sampleRate: rate)
    let hum = (0..<Int(rate * 3)).map { Float(0.05 * sin(2 * .pi * 50 * Double($0) / rate)) }
    XCTAssertEqual(run(&vad, TestSignals.silence(seconds: 0.5) + hum), [])
    vad.reset()
    XCTAssertEqual(run(&vad, TestSignals.silence(seconds: 0.5) + TestSignals.noise(seconds: 3, db: -25)), [])
  }

  func testLevelMeterReportsThirtyReadingsASecond() {
    var meter = LevelMeter(sampleRate: rate)
    let readings = meter.process(TestSignals.voice(seconds: 1, pitch: 140, peakDb: -20))
    XCTAssertEqual(readings.count, 30)
    XCTAssertGreaterThan(Levels.meter(readings.max() ?? 0), 0.4)
    XCTAssertEqual(Levels.meter(0), 0)
  }

  func testPcm16IsLittleEndianAndClamped() {
    let data = Levels.pcm16([0, 1, -1, 2])
    XCTAssertEqual([UInt8](data), [0, 0, 0xFF, 0x7F, 0x01, 0x80, 0xFF, 0x7F])
  }
}
