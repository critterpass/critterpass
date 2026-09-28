import CoreLocation
import Foundation

/// A region transition from `CLMonitor`.
struct RegionEvent: Sendable {
  let id: String
  let entered: Bool
  let timestamp: Date
}

/// The planned regions on `CLMonitor` (≤ 20 conditions), replaced from the JS planner without
/// touching unchanged ones. The monitor keeps its conditions across launches, and under Always it
/// relaunches a terminated app on a transition; the last plan is persisted so the diff after a
/// relaunch starts from what the OS actually holds.
actor MonitorRotation {
  static let monitorName = "cp-trip-regions"
  private static let planKey = "cp.location.monitorPlan"
  private var monitor: CLMonitor?
  private var eventsTask: Task<Void, Never>?
  private var regions: [PlannedRegion] = MonitorRotation.loadPlan()

  /// Opens the monitor and starts delivering its events (idempotent).
  func open(onEvent: @escaping @Sendable (RegionEvent) -> Void) async {
    if monitor != nil { return }
    let opened = await CLMonitor(Self.monitorName)
    monitor = opened
    eventsTask = Task {
      do {
        for try await event in await opened.events {
          switch event.state {
          case .satisfied:
            onEvent(RegionEvent(id: event.identifier, entered: true, timestamp: event.date))
          case .unsatisfied:
            onEvent(RegionEvent(id: event.identifier, entered: false, timestamp: event.date))
          default:
            continue
          }
        }
      } catch {
        // Monitoring stops with authorization; the next session re-opens it.
      }
    }
  }

  func replace(with next: [PlannedRegion], onEvent: @escaping @Sendable (RegionEvent) -> Void) async -> Int {
    await open(onEvent: onEvent)
    guard let monitor else { return 0 }
    let diff = LocationPlanMath.diff(current: regions, next: next)
    for id in diff.remove { await monitor.remove(id) }
    for region in diff.add {
      let condition = CLMonitor.CircularGeographicCondition(
        center: CLLocationCoordinate2D(latitude: region.latitude, longitude: region.longitude),
        radius: region.radius)
      await monitor.add(condition, identifier: region.id, assuming: .unsatisfied)
    }
    regions = Array(next.prefix(LocationPlanMath.monitorLimit))
    Self.savePlan(regions)
    return regions.count
  }

  func clear() async {
    if let monitor {
      for region in regions { await monitor.remove(region.id) }
    }
    regions = []
    Self.savePlan([])
  }

  private static func loadPlan() -> [PlannedRegion] {
    guard let rows = UserDefaults.standard.array(forKey: planKey) as? [[String: Any]] else { return [] }
    return rows.compactMap { row in
      guard let id = row["id"] as? String, let lat = row["lat"] as? Double,
        let lng = row["lng"] as? Double, let radius = row["radius"] as? Double
      else { return nil }
      return PlannedRegion(id: id, latitude: lat, longitude: lng, radius: radius)
    }
  }

  private static func savePlan(_ regions: [PlannedRegion]) {
    let rows: [[String: Any]] = regions.map {
      ["id": $0.id, "lat": $0.latitude, "lng": $0.longitude, "radius": $0.radius]
    }
    UserDefaults.standard.set(rows, forKey: planKey)
  }
}
