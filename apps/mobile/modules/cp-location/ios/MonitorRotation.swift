import CoreLocation
import Foundation

/// `CLMonitor` behind `RegionMonitorOwner`, and the one owner per process. The monitor keeps its
/// conditions across launches, and under Always it relaunches a terminated app on a transition;
/// the last plan is persisted so the diff after a relaunch starts from what the OS holds.
enum MonitorRotation {
  /// Letters only: CoreLocation asserts "Monitor name is not valid" (CLMonitor.mm:507) on a name
  /// with hyphens, and "already in use" (CLMonitor.mm:517) on a second monitor with the same name.
  static let monitorName = LocationPlanMath.monitorName
  private static let planKey = "cp.location.monitorPlan"

  /// Created once per process; module instances (one per JS runtime) share it.
  static let shared = RegionMonitorOwner(
    initialPlan: loadPlan(),
    savePlan: { savePlan($0) },
    makeBackend: { await CLMonitorBackend.open(name: monitorName) }
  )

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

/// One named `CLMonitor`; the owner guarantees it is opened once per process.
final class CLMonitorBackend: RegionMonitorBackend {
  private let monitor: CLMonitor

  private init(monitor: CLMonitor) {
    self.monitor = monitor
  }

  static func open(name: String) async -> CLMonitorBackend {
    CLMonitorBackend(monitor: await CLMonitor(name))
  }

  func add(_ region: PlannedRegion) async {
    let condition = CLMonitor.CircularGeographicCondition(
      center: CLLocationCoordinate2D(latitude: region.latitude, longitude: region.longitude),
      radius: region.radius)
    await monitor.add(condition, identifier: region.id, assuming: .unsatisfied)
  }

  func remove(_ id: String) async {
    await monitor.remove(id)
  }

  func events() async -> AsyncStream<RegionEvent> {
    let monitor = self.monitor
    return AsyncStream { continuation in
      let task = Task {
        do {
          for try await event in await monitor.events {
            switch event.state {
            case .satisfied:
              continuation.yield(RegionEvent(id: event.identifier, entered: true, timestamp: event.date))
            case .unsatisfied:
              continuation.yield(RegionEvent(id: event.identifier, entered: false, timestamp: event.date))
            default:
              continue
            }
          }
        } catch {
          // Monitoring stops with authorization; the stream ends and nothing more arrives.
        }
        continuation.finish()
      }
      continuation.onTermination = { _ in task.cancel() }
    }
  }
}
