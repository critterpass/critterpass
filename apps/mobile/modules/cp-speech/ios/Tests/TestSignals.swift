import Foundation

/// Deterministic stand-ins for what the echo-cancelled mic hears.
enum TestSignals {
  static let sampleRate = 16_000.0

  /// A voiced talker: harmonics of `pitch` shaped like a vowel, swelling and fading by about 8 dB
  /// at a syllable rate of four a second, scaled so the loud parts sit near `peakDb` dBFS.
  static func voice(seconds: Double, pitch: Double, peakDb: Float, phase: Double = 0) -> [Float] {
    let count = Int(seconds * sampleRate)
    let gain = pow(10, peakDb / 20)
    return (0..<count).map { index in
      let t = Double(index) / sampleRate
      var value = 0.0
      for harmonic in 1...12 {
        let frequency = pitch * Double(harmonic)
        let formant = exp(-pow((frequency - 700) / 500, 2)) + 0.5 * exp(-pow((frequency - 1200) / 400, 2))
        value += (0.15 + formant) * sin(2 * .pi * frequency * t + phase * Double(harmonic))
      }
      let syllable = 0.7 + 0.3 * sin(2 * .pi * 4 * t + phase)
      return Float(value / 4 * syllable) * gain * 1.1
    }
  }

  /// Steady room noise (linear congruential, so every run is identical).
  static func noise(seconds: Double, db: Float, seed: UInt32 = 7) -> [Float] {
    var state = seed
    let gain = pow(10, db / 20) * 1.7
    return (0..<Int(seconds * sampleRate)).map { _ in
      state = state &* 1_664_525 &+ 1_013_904_223
      return (Float(state >> 8) / Float(1 << 24) - 0.5) * gain
    }
  }

  static func mix(_ a: [Float], _ b: [Float]) -> [Float] {
    (0..<max(a.count, b.count)).map { index in
      (index < a.count ? a[index] : 0) + (index < b.count ? b[index] : 0)
    }
  }

  static func silence(seconds: Double) -> [Float] {
    [Float](repeating: 0, count: Int(seconds * sampleRate))
  }
}
