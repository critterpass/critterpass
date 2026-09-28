package app.critterpass.location

/** A region the JS planner asked the OS to watch. */
data class PlannedGeofence(val id: String, val lat: Double, val lng: Double, val radiusM: Double)

/**
 * Pure geofence planning for `GeofencingClient`: at most 100 per app, never below the 150 m the
 * platform can reliably resolve, and a diff so a re-plan leaves unchanged fences (and their dwell)
 * alone. No Android types, so the JVM tests run without a device.
 */
object GeofencePlanner {
  const val LIMIT = 100
  const val MIN_RADIUS_M = 150.0

  fun normalize(regions: List<PlannedGeofence>, limit: Int = LIMIT): List<PlannedGeofence> {
    val seen = HashSet<String>()
    return regions
      .filter { seen.add(it.id) && it.lat in -90.0..90.0 && it.lng in -180.0..180.0 }
      .take(limit.coerceAtLeast(0))
      .map { it.copy(radiusM = maxOf(MIN_RADIUS_M, it.radiusM)) }
  }

  data class Diff(val remove: List<String>, val add: List<PlannedGeofence>)

  fun diff(current: List<PlannedGeofence>, next: List<PlannedGeofence>): Diff {
    val wanted = normalize(next)
    val wantedById = wanted.associateBy { it.id }
    val currentById = current.associateBy { it.id }
    val remove = current.filter { wantedById[it.id] != it }.map { it.id }.sorted()
    val add = wanted.filter { currentById[it.id] != it }
    return Diff(remove, add)
  }
}
