import CoreHaptics
import ExpoModulesCore
import QuartzCore

/// Core Haptics ramps and the SOS long pattern (docs/design-system.md §4) — the JS API's
/// `isSupported()` fallback to `expo-haptics` covers devices without a Taptic/haptics engine.
public class CpHapticsModule: Module {
  private var engine: CHHapticEngine?
  private var rampPlayer: CHHapticAdvancedPatternPlayer?
  private var lastRampUpdateAt: CFTimeInterval = 0
  /// "throttled 30 Hz" (T6 step 2).
  private let rampThrottleInterval: CFTimeInterval = 1.0 / 30.0
  /// Long enough that no realistic hold duration outruns it; `rampStop` ends it explicitly either way.
  private let rampMaxDuration: TimeInterval = 60

  public func definition() -> ModuleDefinition {
    Name("CpHaptics")

    Function("isSupported") { () -> Bool in
      CHHapticEngine.capabilitiesForHardware().supportsHaptics
    }

    Function("play") { (patternId: String) in
      guard patternId == "sos" else { return }
      self.play { try HapticPatterns.sos() }
    }

    Function("rampStart") {
      self.startRamp()
    }

    Function("rampUpdate") { (intensity: Double) in
      self.updateRamp(intensity: Float(intensity))
    }

    Function("rampStop") {
      self.stopRamp()
    }
  }

  /// Lazily starts (or restarts after a reset/interruption) the shared haptics engine (T6 step 4).
  private func ensureEngine() -> CHHapticEngine? {
    if let engine { return engine }
    guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return nil }
    do {
      let newEngine = try CHHapticEngine()
      newEngine.resetHandler = { [weak self] in
        try? self?.engine?.start()
      }
      newEngine.stoppedHandler = { [weak self] _ in
        self?.engine = nil
      }
      try newEngine.start()
      engine = newEngine
      return newEngine
    } catch {
      return nil
    }
  }

  private func play(_ makePattern: () throws -> CHHapticPattern) {
    guard let engine = ensureEngine() else { return }
    do {
      let pattern = try makePattern()
      let player = try engine.makePlayer(with: pattern)
      try player.start(atTime: CHHapticTimeImmediate)
    } catch {
      // No engine / pattern failure: fail silently — the JS side already gated on `isSupported()`.
    }
  }

  private func startRamp() {
    guard let engine = ensureEngine() else { return }
    do {
      let pattern = try HapticPatterns.continuousRamp(maxDuration: rampMaxDuration)
      let player = try engine.makeAdvancedPlayer(with: pattern)
      try player.start(atTime: CHHapticTimeImmediate)
      rampPlayer = player
      lastRampUpdateAt = 0
    } catch {
      rampPlayer = nil
    }
  }

  private func updateRamp(intensity: Float) {
    guard let rampPlayer else { return }
    let now = CACurrentMediaTime()
    guard now - lastRampUpdateAt >= rampThrottleInterval else { return }
    lastRampUpdateAt = now
    let clamped = min(max(intensity, 0), 1)
    let parameter = CHHapticDynamicParameter(
      parameterID: .hapticIntensityControl,
      value: clamped,
      relativeTime: 0
    )
    try? rampPlayer.sendParameters([parameter], atTime: CHHapticTimeImmediate)
  }

  private func stopRamp() {
    try? rampPlayer?.stop(atTime: CHHapticTimeImmediate)
    rampPlayer = nil
  }
}
