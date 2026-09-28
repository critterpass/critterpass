package app.critterpass.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent

/**
 * Geofence transitions from `GeofencingClient`, delivered even with the app closed. Each goes to
 * the engine (live, or held until it drains them); an enter while the trip day is on restarts the
 * location session, which a geofence transition is allowed to do from the background.
 */
class GeofenceReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val event = GeofencingEvent.fromIntent(intent) ?: return
    if (event.hasError()) return
    val kind = when (event.geofenceTransition) {
      Geofence.GEOFENCE_TRANSITION_ENTER -> "enter"
      Geofence.GEOFENCE_TRANSITION_EXIT -> "exit"
      else -> return
    }
    val at = (event.triggeringLocation?.time ?: System.currentTimeMillis()).toDouble()
    event.triggeringGeofences?.forEach { fence ->
      SessionBus.region(context, mapOf("id" to fence.requestId, "event" to kind, "at" to at))
    }
    if (kind == "enter" && SessionStore.isActive(context)) {
      runCatching { TripLocationService.start(context, SessionStore.tier(context)) }
    }
  }
}
