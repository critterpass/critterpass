import Foundation

/// Sample maths shared by the level meter, the VAD and the streaming engine's PCM frames.
public enum Levels {
  /// Root mean square of mono samples (-1...1).
  public static func rms(_ samples: [Float]) -> Float {
    guard !samples.isEmpty else { return 0 }
    var sum: Float = 0
    for sample in samples { sum += sample * sample }
    return (sum / Float(samples.count)).squareRoot()
  }

  /// Level in dB full scale, floored at -100 for silence.
  public static func dbfs(_ samples: [Float]) -> Float {
    let value = rms(samples)
    return value > 0.00001 ? 20 * log10(value) : -100
  }

  /// Sign changes per sample.
  public static func zeroCrossingRate(_ samples: [Float]) -> Float {
    guard samples.count > 1 else { return 0 }
    var crossings = 0
    for index in 1..<samples.count where (samples[index - 1] >= 0) != (samples[index] >= 0) {
      crossings += 1
    }
    return Float(crossings) / Float(samples.count - 1)
  }

  /// The meter's 0...1 value: -60 dBFS and below is 0, 0 dBFS is 1.
  public static func meter(_ rms: Float) -> Float {
    guard rms > 0.00001 else { return 0 }
    return min(1, max(0, (20 * log10(rms) + 60) / 60))
  }

  /// 16-bit little-endian PCM for the streaming recogniser.
  public static func pcm16(_ samples: [Float]) -> Data {
    var data = Data(capacity: samples.count * 2)
    for sample in samples {
      let clamped = max(-1, min(1, sample))
      let value = Int16(clamped * Float(Int16.max)).littleEndian
      withUnsafeBytes(of: value) { data.append(contentsOf: $0) }
    }
    return data
  }
}

/// Emits one RMS reading per window (about 30 per second) from mono samples of any length.
public struct LevelMeter: Sendable {
  private let window: Int
  private var sum: Float = 0
  private var count = 0

  public init(sampleRate: Double, perSecond: Double = 30) {
    window = max(1, Int(sampleRate / perSecond))
  }

  public mutating func process(_ samples: [Float]) -> [Float] {
    var readings: [Float] = []
    for sample in samples {
      sum += sample * sample
      count += 1
      if count == window {
        readings.append((sum / Float(window)).squareRoot())
        sum = 0
        count = 0
      }
    }
    return readings
  }
}
