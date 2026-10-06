# cp-android-surfaces

Android off-app surfaces in Kotlin: Live Updates, notification actions and the vote poster, the
`cp_sos` channel, Glance widgets, the lock-screen hub probe, the sleepy-clock dream, widget pinning
and signed `/v1/actions` requests with a Keystore-held action key.

- Gradle project: `:cp-android-surfaces` (autolinking names it after `package.json`'s `name`).
  Unit tests: `./gradlew :cp-android-surfaces:testDebugUnitTest`.
- Depends on `:cp-app-group` (shared files) and `:cp-notifications` (the one FCM service, which
  this module registers its handlers and actions with from `CpAndroidSurfacesPackage`).
- Permissions come from `apps/mobile/plugins/with-android-surfaces.ts`; components from this
  module's manifest through the Gradle manifest merger.
