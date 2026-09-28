import CoreLocation
import Foundation

/// The trip-day While-In-Use session: a `CLBackgroundActivitySession` (the blue status-bar pill;
/// location keeps flowing with the phone locked) plus a `CLServiceSession` declaring When-In-Use
/// authorization. Both must be created while the app is in the foreground; the "session is on"
/// flag is persisted so a relaunch (after the system ended the app) recreates them. The engine's
/// accuracy tier is kept alongside.
final class SessionManager: @unchecked Sendable {
  static let shared = SessionManager()
  static let activeKey = "cp.location.tripSession"
  private let lock = NSLock()
  private var background: CLBackgroundActivitySession?
  private var service: CLServiceSession?
  private var currentTier = "balanced"

  var isRunning: Bool { lock.withLock { background != nil } }

  var tier: String {
    get { lock.withLock { currentTier } }
    set { lock.withLock { currentTier = newValue } }
  }

  func start() {
    lock.withLock {
      if background == nil { background = CLBackgroundActivitySession() }
      if service == nil { service = CLServiceSession(authorization: .whenInUse) }
    }
    UserDefaults.standard.set(true, forKey: Self.activeKey)
  }

  func stop() {
    lock.withLock {
      background?.invalidate()
      service?.invalidate()
      background = nil
      service = nil
    }
    UserDefaults.standard.set(false, forKey: Self.activeKey)
  }

  /// On launch: bring the session back if the trip day was still running when the app ended.
  @discardableResult
  func restoreIfNeeded() -> Bool {
    guard UserDefaults.standard.bool(forKey: Self.activeKey) else { return false }
    start()
    return true
  }
}
