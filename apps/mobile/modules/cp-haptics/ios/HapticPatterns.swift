import CoreHaptics

/// Haptic patterns generated from `sound.tokens.json`'s haptic column (docs/design-system.md §4).
/// `play(patternId:)` only ever needs `sos` here — `holdRamp`'s continuous ramp is built directly by
/// `CpHapticsModule`'s `rampStart`/`rampUpdate`, never as a static pattern.
enum HapticPatterns {
  static let shortPulseSeconds: TimeInterval = 0.12
  static let longPulseSeconds: TimeInterval = 0.36
  static let pulseGapSeconds: TimeInterval = 0.12
  static let groupGapSeconds: TimeInterval = 0.28

  /// The SOS pattern's raw events (Morse-style dot-dot-dot, dash-dash-dash, dot-dot-dot) — a plain
  /// array rather than a `CHHapticPattern` directly, so `HapticPatternsTests` can assert on pulse
  /// count/duration/ordering without a real haptics engine.
  static func sosEvents() -> [CHHapticEvent] {
    var events: [CHHapticEvent] = []
    var time: TimeInterval = 0

    func appendPulse(duration: TimeInterval) {
      events.append(
        CHHapticEvent(
          eventType: .hapticContinuous,
          parameters: [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.8),
          ],
          relativeTime: time,
          duration: duration
        )
      )
      time += duration + pulseGapSeconds
    }

    func appendGroup(pulseDuration: TimeInterval) {
      for _ in 0..<3 { appendPulse(duration: pulseDuration) }
      time += groupGapSeconds - pulseGapSeconds
    }

    appendGroup(pulseDuration: shortPulseSeconds)
    appendGroup(pulseDuration: longPulseSeconds)
    appendGroup(pulseDuration: shortPulseSeconds)

    return events
  }

  /// "SOS break-through; bypasses quiet hours".
  static func sos() throws -> CHHapticPattern {
    try CHHapticPattern(events: sosEvents(), parameters: [])
  }

  /// A single long-lived continuous event `rampStart` plays and `rampUpdate` reshapes via dynamic
  /// parameters — `holdRamp`'s "intensity 0→1 driven by the `holdFill` value" (T6 step 2).
  static func continuousRamp(maxDuration: TimeInterval) throws -> CHHapticPattern {
    let event = CHHapticEvent(
      eventType: .hapticContinuous,
      parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5),
      ],
      relativeTime: 0,
      duration: maxDuration
    )
    return try CHHapticPattern(events: [event], parameters: [])
  }
}
