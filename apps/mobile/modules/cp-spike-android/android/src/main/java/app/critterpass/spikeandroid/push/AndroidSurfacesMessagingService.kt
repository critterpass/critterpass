package app.critterpass.spikeandroid.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Real `FirebaseMessagingService` subclass compiled and linked against the actual
 * `firebase-messaging` library. No Firebase project exists in this environment (no
 * `google-services.json`), so this service is registered in the manifest and ready, but nothing
 * in this pass claims a real push was delivered through it — see the ADR's founder follow-ups and
 * `AndroidSurfacesPushReceiver`'s doc comment for how the same code path is exercised instead.
 */
class AndroidSurfacesMessagingService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    AndroidSurfacesPushReceiver.handle(applicationContext, message.data)
  }
}
