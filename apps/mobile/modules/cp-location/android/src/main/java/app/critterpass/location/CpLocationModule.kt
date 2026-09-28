package app.critterpass.location

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The trip-day location session for the JS engine (src/lib/location): the foreground service,
 * the accuracy tier, and the planner's geofences on `GeofencingClient` (≤ 100, radius ≥ 150 m).
 * Background geofences need "Allow all the time"; without it adding them fails and the engine
 * relies on the session alone.
 */
class CpLocationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CpLocation")

    Events("onFix", "onRegion")

    OnStartObserving {
      SessionBus.attach({ sendEvent("onFix", it) }, { sendEvent("onRegion", it) })
    }

    OnStopObserving {
      SessionBus.detach()
    }

    // Called from visible UI only (a foreground service may not start from the background).
    AsyncFunction("startTripSession") { tier: String ->
      SessionStore.setActive(context, true)
      SessionStore.setTier(context, tier)
      TripLocationService.start(context, tier)
      true
    }

    AsyncFunction("stopTripSession") {
      SessionStore.setActive(context, false)
      context.stopService(Intent(context, TripLocationService::class.java))
    }

    Function("setAccuracy") { tier: String ->
      SessionStore.setTier(context, tier)
      if (SessionStore.isActive(context)) {
        runCatching { TripLocationService.command(context, TripLocationService.ACTION_TIER, tier) }
      }
    }

    Function("isSessionRunning") { SessionStore.isActive(context) }

    // Parallel arrays, the same shape iOS takes: `[id]` and `[[lat, lng, radiusM]]`.
    AsyncFunction("monitorRegions") { ids: List<String>, coordinates: List<List<Double>>, promise: Promise ->
      val fences = ids.zip(coordinates).mapNotNull { (id, values) ->
        if (values.size == 3) PlannedGeofence(id, values[0], values[1], values[2]) else null
      }
      monitor(fences, promise)
    }

    AsyncFunction("clearRegions") { promise: Promise ->
      LocationServices.getGeofencingClient(context).removeGeofences(geofenceIntent())
        .addOnCompleteListener {
          SessionStore.setFences(context, emptyList())
          promise.resolve(null)
        }
    }

    Function("isLowPowerMode") {
      context.getSystemService(PowerManager::class.java)?.isPowerSaveMode ?: false
    }

    Function("drainRegionEvents") { SessionStore.drainRegions(context) }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  private fun geofenceIntent(): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, GeofenceReceiver::class.java),
      // Geofencing fills the intent in, so it must stay mutable.
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
    )

  private fun monitor(next: List<PlannedGeofence>, promise: Promise) {
    val client = LocationServices.getGeofencingClient(context)
    val diff = GeofencePlanner.diff(SessionStore.fences(context), next)
    val wanted = GeofencePlanner.normalize(next)
    val add = {
      if (diff.add.isEmpty()) {
        SessionStore.setFences(context, wanted)
        promise.resolve(wanted.size)
      } else {
        val request = GeofencingRequest.Builder()
          .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
          .addGeofences(
            diff.add.map {
              Geofence.Builder()
                .setRequestId(it.id)
                .setCircularRegion(it.lat, it.lng, it.radiusM.toFloat())
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
                .build()
            },
          )
          .build()
        try {
          client.addGeofences(request, geofenceIntent())
            .addOnSuccessListener {
              SessionStore.setFences(context, wanted)
              promise.resolve(wanted.size)
            }
            .addOnFailureListener {
              // Most often: no "Allow all the time". The session still runs without OS fences.
              SessionStore.setFences(context, emptyList())
              promise.resolve(0)
            }
        } catch (_: SecurityException) {
          SessionStore.setFences(context, emptyList())
          promise.resolve(0)
        }
      }
    }
    if (diff.remove.isEmpty()) add() else client.removeGeofences(diff.remove).addOnCompleteListener { add() }
  }
}
