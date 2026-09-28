import Foundation

/// A region transition from the OS region monitor.
public struct RegionEvent: Sendable, Equatable {
  public let id: String
  public let entered: Bool
  public let timestamp: Date

  public init(id: String, entered: Bool, timestamp: Date) {
    self.id = id
    self.entered = entered
    self.timestamp = timestamp
  }
}

/// The OS region monitor behind the owner (`CLMonitor` in the app, a fake in tests).
public protocol RegionMonitorBackend: Sendable {
  func add(_ region: PlannedRegion) async
  func remove(_ id: String) async
  /// The monitor's one event stream; the owner is its only consumer.
  func events() async -> AsyncStream<RegionEvent>
}

/// The process-wide owner of the region monitor. CoreLocation allows one `CLMonitor` per name per
/// process and asserts on a second, but the Expo module is recreated on every JS reload (an OTA
/// update applied at launch, `Updates.reloadAsync`, a dev reload) while the process lives on. So
/// the monitor is opened once, lazily and idempotently, its events have exactly one consumer, and
/// a new module instance only swaps in its event sink; the previous sink never hears again.
public actor RegionMonitorOwner {
  public typealias Sink = @Sendable (RegionEvent) -> Void

  private let makeBackend: @Sendable () async -> any RegionMonitorBackend
  private let savePlan: @Sendable ([PlannedRegion]) -> Void
  private var backend: (any RegionMonitorBackend)?
  private var opening: Task<any RegionMonitorBackend, Never>?
  private var consumer: Task<Void, Never>?
  private var sink: Sink?
  private var sinkOwner: ObjectIdentifier?
  private var regions: [PlannedRegion]

  public init(
    initialPlan: [PlannedRegion],
    savePlan: @escaping @Sendable ([PlannedRegion]) -> Void,
    makeBackend: @escaping @Sendable () async -> any RegionMonitorBackend
  ) {
    self.regions = initialPlan
    self.savePlan = savePlan
    self.makeBackend = makeBackend
  }

  /// Regions the OS holds from an earlier launch: the monitor must reopen at launch to hear them.
  public var hasPlan: Bool { !regions.isEmpty }

  /// Where events go from now on: the live module instance (`owner` is its identity).
  public func setSink(_ next: @escaping Sink, owner: ObjectIdentifier) {
    sink = next
    sinkOwner = owner
  }

  /// A module instance going away stops listening, unless a newer one already took over.
  public func releaseSink(owner: ObjectIdentifier) {
    guard sinkOwner == owner else { return }
    sink = nil
    sinkOwner = nil
  }

  /// Opens the monitor once per process; concurrent and repeated calls share the first open.
  @discardableResult
  public func open() async -> any RegionMonitorBackend {
    if let backend { return backend }
    if let opening { return await opening.value }
    let make = makeBackend
    let task = Task { await make() }
    opening = task
    let opened = await task.value
    backend = opened
    opening = nil
    if consumer == nil {
      // Subscribed before `open` returns, so nothing the monitor reports right away is missed.
      let stream = await opened.events()
      consumer = Task { [weak self] in
        for await event in stream {
          await self?.deliver(event)
        }
      }
    }
    return opened
  }

  private func deliver(_ event: RegionEvent) {
    sink?(event)
  }

  /// Makes the monitor hold exactly `next` (first `LocationPlanMath.monitorLimit`), leaving
  /// unchanged regions alone. Resolves with how many regions it holds.
  public func replace(with next: [PlannedRegion]) async -> Int {
    let monitor = await open()
    let diff = LocationPlanMath.diff(current: regions, next: next)
    for id in diff.remove { await monitor.remove(id) }
    for region in diff.add { await monitor.add(region) }
    regions = Array(next.prefix(LocationPlanMath.monitorLimit))
    savePlan(regions)
    return regions.count
  }

  public func clear() async {
    if !regions.isEmpty {
      // After a relaunch the OS still holds the last plan even though nothing is open yet.
      let monitor = await open()
      for region in regions { await monitor.remove(region.id) }
    }
    regions = []
    savePlan([])
  }
}
