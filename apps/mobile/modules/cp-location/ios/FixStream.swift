import CoreLocation
import Foundation

/// One live fix as the JS engine reads it (built into the event body by the module).
struct FixEvent: Sendable {
  let latitude: Double
  let longitude: Double
  let horizontalAccuracy: Double
  let timestamp: Date
  let speed: Double?
  let stationary: Bool
  let mockFlags: Int
}

/// `CLLocationUpdate.liveUpdates` for the running session. The stream has no accuracy dial, so
/// the tier picks the configuration (fitness for high accuracy near a spot) and the coarse tier is
/// throttled; the system's own stationary signal rides along so the engine can pause.
///
/// One stream per process: the module is recreated on every JS reload while the process lives
/// on, and a second live-updates loop would double every fix and drain the battery.
final class FixStream: @unchecked Sendable {
  static let shared = FixStream()

  private var task: Task<Void, Never>?
  private let lock = NSLock()
  private var tier = "balanced"
  private var lastEmitted: Date?

  var isRunning: Bool { lock.withLock { task != nil } }

  func start(tier: String, emit: @escaping @Sendable (FixEvent) -> Void) {
    stop()
    lock.withLock {
      self.tier = tier
      self.lastEmitted = nil
    }
    guard tier != "paused" else { return }
    let configuration: CLLocationUpdate.LiveConfiguration = tier == "high" ? .fitness : .default
    let started = Task { [weak self] in
      do {
        for try await update in CLLocationUpdate.liveUpdates(configuration) {
          if Task.isCancelled { break }
          guard let self, let location = update.location else { continue }
          let now = Date()
          let emitNow: Bool = self.lock.withLock {
            let ok = LocationPlanMath.shouldEmit(tier: self.tier, lastEmitted: self.lastEmitted, now: now)
            if ok { self.lastEmitted = now }
            return ok
          }
          guard emitNow else { continue }
          let source = location.sourceInformation
          emit(
            FixEvent(
              latitude: location.coordinate.latitude,
              longitude: location.coordinate.longitude,
              horizontalAccuracy: location.horizontalAccuracy,
              timestamp: location.timestamp,
              speed: location.speed >= 0 ? location.speed : nil,
              stationary: update.stationary,
              mockFlags: LocationPlanMath.mockFlags(
                simulatedBySoftware: source?.isSimulatedBySoftware ?? false,
                producedByAccessory: source?.isProducedByAccessory ?? false)))
        }
      } catch {
        // The stream ends when authorization is lost; the engine sees no more fixes and the
        // permission mirror reports why.
      }
    }
    lock.withLock { task = started }
  }

  func stop() {
    let running = lock.withLock { () -> Task<Void, Never>? in
      defer { task = nil }
      return task
    }
    running?.cancel()
  }
}
