import Foundation

/// A region the planner asked the OS to watch (radius already floored by the planner).
public struct PlannedRegion: Equatable, Sendable {
  public let id: String
  public let latitude: Double
  public let longitude: Double
  public let radius: Double

  public init(id: String, latitude: Double, longitude: Double, radius: Double) {
    self.id = id
    self.latitude = latitude
    self.longitude = longitude
    self.radius = radius
  }
}

/// Pure planning helpers shared by the monitor and the fix stream (Foundation only, so the
/// host-side `swift test` runs them without a simulator).
public enum LocationPlanMath {
  /// The one `CLMonitor` name: CoreLocation accepts letters and digits only.
  public static let monitorName = "cpTripRegions"

  /// Whether CoreLocation will accept `name` for a `CLMonitor` (letters and digits only).
  public static func isValidMonitorName(_ name: String) -> Bool {
    !name.isEmpty && name.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) && $0.isASCII }
  }

  /// `CLMonitor` holds at most 20 conditions per app.
  public static let monitorLimit = 20

  /// What to remove and what to add so the monitor holds exactly `next` (first `limit` of it).
  /// A region whose center or radius changed is replaced; unchanged ones are left alone, so a
  /// re-plan never resets the dwell of a place the user is standing in.
  public static func diff(
    current: [PlannedRegion], next: [PlannedRegion], limit: Int = monitorLimit
  ) -> (remove: [String], add: [PlannedRegion]) {
    let wanted = Array(next.prefix(max(0, limit)))
    let wantedById = Dictionary(wanted.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    let currentById = Dictionary(current.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    let remove = current.filter { wantedById[$0.id] != $0 }.map(\.id)
    var seen = Set<String>()
    let add = wanted.filter { region in
      guard seen.insert(region.id).inserted else { return false }
      return currentById[region.id] != region
    }
    return (remove.sorted(), add)
  }

  /// Anti-spoof bits shared with `@cp/domain`: 1 simulated by software, 2 external accessory.
  public static func mockFlags(simulatedBySoftware: Bool, producedByAccessory: Bool) -> Int {
    (simulatedBySoftware ? 1 : 0) | (producedByAccessory ? 2 : 0)
  }

  /// Coarse tier: keep at most one fix per `interval` seconds (the live stream has no accuracy dial).
  public static func shouldEmit(tier: String, lastEmitted: Date?, now: Date, coarseInterval: TimeInterval = 60) -> Bool {
    guard tier == "coarse", let lastEmitted else { return tier != "paused" }
    return now.timeIntervalSince(lastEmitted) >= coarseInterval
  }

  /// The fix event body the JS engine reads.
  public static func fixBody(
    latitude: Double, longitude: Double, horizontalAccuracy: Double, timestamp: Date,
    speed: Double?, stationary: Bool, mockFlags: Int
  ) -> [String: Any] {
    var body: [String: Any] = [
      "lat": latitude,
      "lng": longitude,
      "acc": max(0, horizontalAccuracy),
      "at": timestamp.timeIntervalSince1970 * 1000,
      "stationary": stationary,
      "mock": mockFlags,
    ]
    if let speed, speed >= 0 { body["speed"] = speed }
    return body
  }
}
