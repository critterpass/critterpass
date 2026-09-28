import ExpoModulesCore
import Foundation

/// The trip-day location session for the JS engine (src/lib/location): start/stop the While-In-Use
/// session, stream fixes at the engine's accuracy tier, and keep the planner's regions on
/// `CLMonitor`. Region events that arrive before JS listens (a relaunch under Always) are held
/// until the engine drains them.
public class CpLocationModule: Module {
  private let fixes = FixStream()
  private let monitor = MonitorRotation()
  private let buffer = RegionBuffer()

  public func definition() -> ModuleDefinition {
    Name("CpLocation")

    Events("onFix", "onRegion")

    OnCreate {
      let session = SessionManager.shared
      if session.restoreIfNeeded() {
        self.fixes.start(tier: session.tier, emit: self.fixSink())
      }
      let sink = self.regionSink()
      let monitor = self.monitor
      Task { await monitor.open(onEvent: sink) }
    }

    OnStartObserving {
      self.buffer.setObserving(true)
    }

    OnStopObserving {
      self.buffer.setObserving(false)
    }

    // Created on the main queue while the app is in the foreground (the session's own rule).
    AsyncFunction("startTripSession") { (tier: String) -> Bool in
      let session = SessionManager.shared
      session.start()
      session.tier = tier
      self.fixes.start(tier: tier, emit: self.fixSink())
      return true
    }.runOnQueue(.main)

    AsyncFunction("stopTripSession") {
      self.fixes.stop()
      SessionManager.shared.stop()
    }.runOnQueue(.main)

    Function("setAccuracy") { (tier: String) in
      let session = SessionManager.shared
      session.tier = tier
      guard session.isRunning else { return }
      if tier == "paused" {
        self.fixes.stop()
      } else {
        self.fixes.start(tier: tier, emit: self.fixSink())
      }
    }

    Function("isSessionRunning") { () -> Bool in
      SessionManager.shared.isRunning
    }

    AsyncFunction("monitorRegions") { (rows: [[String: Any]]) async -> Int in
      let regions = rows.compactMap { row -> PlannedRegion? in
        guard let id = row["id"] as? String, let lat = row["lat"] as? Double,
          let lng = row["lng"] as? Double, let radius = row["radiusM"] as? Double
        else { return nil }
        return PlannedRegion(id: id, latitude: lat, longitude: lng, radius: radius)
      }
      return await self.monitor.replace(with: regions, onEvent: self.regionSink())
    }

    AsyncFunction("clearRegions") {
      await self.monitor.clear()
    }

    Function("isLowPowerMode") { () -> Bool in
      ProcessInfo.processInfo.isLowPowerModeEnabled
    }

    Function("drainRegionEvents") { () -> [[String: Any]] in
      self.buffer.drain()
    }
  }

  private func fixSink() -> @Sendable (FixEvent) -> Void {
    { [weak self] fix in
      self?.sendEvent(
        "onFix",
        LocationPlanMath.fixBody(
          latitude: fix.latitude, longitude: fix.longitude,
          horizontalAccuracy: fix.horizontalAccuracy, timestamp: fix.timestamp, speed: fix.speed,
          stationary: fix.stationary, mockFlags: fix.mockFlags))
    }
  }

  private func regionSink() -> @Sendable (RegionEvent) -> Void {
    { [weak self] event in
      guard let self else { return }
      let body: [String: Any] = [
        "id": event.id,
        "event": event.entered ? "enter" : "exit",
        "at": event.timestamp.timeIntervalSince1970 * 1000,
      ]
      if self.buffer.hold(body) { return }
      self.sendEvent("onRegion", body)
    }
  }
}

/// Region events kept while nobody listens (JS not loaded yet after a background relaunch).
final class RegionBuffer: @unchecked Sendable {
  private let lock = NSLock()
  private var observing = false
  private var held: [[String: Any]] = []

  func setObserving(_ value: Bool) { lock.withLock { observing = value } }

  /// True when the event was held instead of sent.
  func hold(_ body: [String: Any]) -> Bool {
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
