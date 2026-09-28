import ExpoModulesCore
import Foundation

/// The trip-day location session for the JS engine (src/lib/location): start/stop the While-In-Use
/// session, stream fixes at the engine's accuracy tier, and keep the planner's regions on
/// `CLMonitor`. Region events that arrive before JS listens (a relaunch under Always) are held
/// until the engine drains them.
///
/// Expo runs async function bodies as `@Sendable` closures, so they capture only Sendable values
/// (the stream, the monitor actor, the emitter box), never the module itself.
public class CpLocationModule: Module {
  private let fixes = FixStream()
  private let monitor = MonitorRotation()
  private let emitter = EventEmitter()

  public func definition() -> ModuleDefinition {
    let fixes = self.fixes
    let monitor = self.monitor
    let emitter = self.emitter

    Name("CpLocation")

    Events("onFix", "onRegion")

    OnCreate {
      emitter.module = self
      let session = SessionManager.shared
      if session.restoreIfNeeded() {
        fixes.start(tier: session.tier, emit: emitter.fixSink)
      }
      let sink = emitter.regionSink
      Task { await monitor.open(onEvent: sink) }
    }

    OnStartObserving {
      emitter.setObserving(true)
    }

    OnStopObserving {
      emitter.setObserving(false)
    }

    // Created on the main queue while the app is in the foreground (the session's own rule).
    AsyncFunction("startTripSession") { (tier: String) -> Bool in
      let session = SessionManager.shared
      session.start()
      session.tier = tier
      fixes.start(tier: tier, emit: emitter.fixSink)
      return true
    }.runOnQueue(.main)

    AsyncFunction("stopTripSession") {
      fixes.stop()
      SessionManager.shared.stop()
    }.runOnQueue(.main)

    Function("setAccuracy") { (tier: String) in
      let session = SessionManager.shared
      session.tier = tier
      guard session.isRunning else { return }
      if tier == "paused" {
        fixes.stop()
      } else {
        fixes.start(tier: tier, emit: emitter.fixSink)
      }
    }

    Function("isSessionRunning") { () -> Bool in
      SessionManager.shared.isRunning
    }

    AsyncFunction("monitorRegions") { (ids: [String], coordinates: [[Double]]) async -> Int in
      // Parallel arrays of Sendable values: `[id]` and `[[lat, lng, radiusM]]`.
      let regions = zip(ids, coordinates).compactMap { id, values -> PlannedRegion? in
        guard values.count == 3 else { return nil }
        return PlannedRegion(id: id, latitude: values[0], longitude: values[1], radius: values[2])
      }
      return await monitor.replace(with: regions, onEvent: emitter.regionSink)
    }

    AsyncFunction("clearRegions") { () async in
      await monitor.clear()
    }

    Function("isLowPowerMode") { () -> Bool in
      ProcessInfo.processInfo.isLowPowerModeEnabled
    }

    Function("drainRegionEvents") { () -> [[String: Any]] in
      emitter.drain()
    }
  }
}

/// Sends the module's events from any thread: a Sendable box around a weak module reference, with
/// the region events held while nobody listens (JS not loaded yet after a background relaunch).
final class EventEmitter: @unchecked Sendable {
  private let lock = NSLock()
  private weak var owner: Module?
  private var observing = false
  private var held: [[String: Any]] = []

  var module: Module? {
    get { lock.withLock { owner } }
    set { lock.withLock { owner = newValue } }
  }

  var fixSink: @Sendable (FixEvent) -> Void {
    { [self] fix in
      module?.sendEvent(
        "onFix",
        LocationPlanMath.fixBody(
          latitude: fix.latitude, longitude: fix.longitude,
          horizontalAccuracy: fix.horizontalAccuracy, timestamp: fix.timestamp, speed: fix.speed,
          stationary: fix.stationary, mockFlags: fix.mockFlags))
    }
  }

  var regionSink: @Sendable (RegionEvent) -> Void {
    { [self] event in
      let body: [String: Any] = [
        "id": event.id,
        "event": event.entered ? "enter" : "exit",
        "at": event.timestamp.timeIntervalSince1970 * 1000,
      ]
      if hold(body) { return }
      module?.sendEvent("onRegion", body)
    }
  }

  func setObserving(_ value: Bool) { lock.withLock { observing = value } }

  /// True when the event was held instead of sent.
  private func hold(_ body: [String: Any]) -> Bool {
    lock.withLock {
      guard !observing else { return false }
      held.append(body)
      if held.count > 100 { held.removeFirst(held.count - 100) }
      return true
    }
  }

  func drain() -> [[String: Any]] {
    lock.withLock {
      defer { held = [] }
      return held
    }
  }
}
