package app.critterpass.surfaces

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

/**
 * Autolinked through Expo's package list, so it runs in `Application.onCreate` of every process
 * start, including the one FCM wakes for a data message while the app is closed: that is where the
 * surfaces register with cp-notifications' messaging service before the message is handled.
 */
class CpAndroidSurfacesPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(
      object : ApplicationLifecycleListener {
        override fun onCreate(application: Application) {
          SurfacesSetup.install(application)
        }
      },
    )
}
