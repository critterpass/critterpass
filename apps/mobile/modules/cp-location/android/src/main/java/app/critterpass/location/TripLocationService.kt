package app.critterpass.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices

/**
 * The trip-day session on Android: a foreground service of type location with an ongoing
 * notification and a Stop action. It is started only from visible UI or from a geofence
 * transition (both allowed background-start cases), and streams fused fixes at the engine's tier.
 */
class TripLocationService : Service() {
  companion object {
    const val ACTION_START = "app.critterpass.location.START"
    const val ACTION_TIER = "app.critterpass.location.TIER"
    const val ACTION_STOP = "app.critterpass.location.STOP"
    const val EXTRA_TIER = "tier"
    private const val CHANNEL_ID = "trip_location"
    private const val NOTIFICATION_ID = 7201

    fun start(context: Context, tier: String) {
      val intent = Intent(context, TripLocationService::class.java)
        .setAction(ACTION_START)
        .putExtra(EXTRA_TIER, tier)
      ContextCompat.startForegroundService(context, intent)
    }

    fun command(context: Context, action: String, tier: String? = null) {
      val intent = Intent(context, TripLocationService::class.java).setAction(action)
      if (tier != null) intent.putExtra(EXTRA_TIER, tier)
      context.startService(intent)
    }
  }

  private lateinit var client: FusedLocationProviderClient
  private val speeds = ArrayDeque<Float>()

  private val callback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      for (location in result.locations) emit(location)
    }
  }

  override fun onCreate() {
    super.onCreate()
    client = LocationServices.getFusedLocationProviderClient(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      client.removeLocationUpdates(callback)
      SessionStore.setActive(this, false)
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    val tier = intent?.getStringExtra(EXTRA_TIER) ?: SessionStore.tier(this)
    SessionStore.setTier(this, tier)
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    request(tier)
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    client.removeLocationUpdates(callback)
    super.onDestroy()
  }

  private fun request(tier: String) {
    client.removeLocationUpdates(callback)
    val spec = FixStream.requestFor(tier) ?: return
    val request = LocationRequest.Builder(spec.priority, spec.intervalMs)
      .setMinUpdateDistanceMeters(spec.minDistanceM)
      .build()
    try {
      client.requestLocationUpdates(request, callback, Looper.getMainLooper())
    } catch (_: SecurityException) {
      // Location was revoked in Settings: the session cannot run, and the mirror reports why.
      SessionStore.setActive(this, false)
      stopSelf()
    }
  }

  private fun emit(location: Location) {
    val speed = if (location.hasSpeed()) location.speed else null
    if (speed != null) {
      speeds.addLast(speed)
      while (speeds.size > 5) speeds.removeFirst()
    }
    val mock = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      location.isMock
    } else {
      @Suppress("DEPRECATION")
      location.isFromMockProvider
    }
    val raw = RawFix(
      lat = location.latitude,
      lng = location.longitude,
      accuracyM = if (location.hasAccuracy()) location.accuracy else null,
      timeMs = location.time,
      speedMps = speed,
      isMock = mock,
    )
    SessionBus.fix(FixStream.body(raw, FixStream.isStationary(speeds.toList())))
  }

  private fun notification(): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, getString(R.string.cp_location_channel), NotificationManager.IMPORTANCE_LOW),
      )
    }
    val stop = PendingIntent.getService(
      this,
      1,
      Intent(this, TripLocationService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 2, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(getString(R.string.cp_location_title))
      .setContentText(getString(R.string.cp_location_text))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
      .addAction(0, getString(R.string.cp_location_stop), stop)
    if (open != null) builder.setContentIntent(open)
    return builder.build()
  }
}
