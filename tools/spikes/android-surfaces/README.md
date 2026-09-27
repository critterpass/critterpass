# Android surfaces spike — method and manual checks

Kotlin module: `apps/mobile/modules/cp-spike-android/`. Dev screen:
`apps/mobile/src/app/(dev)/spikes/android-surfaces.tsx`. Sender: `pnpm --filter @cp/spikes run
android-surfaces` (`tools/spikes/src/android-surfaces/run.ts`).

## Rerun everything

```
cd apps/mobile && npx expo prebuild --platform android --no-install
cd android && ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew \
  -Dorg.gradle.jvmargs=-Xmx1536m --max-workers=2 \
  :cp-spike-android:testDebugUnitTest
```

## Local test hook (no Firebase project in this environment)

Exercise the exact receiver code a real FCM push would reach, without Metro:

```
adb shell am broadcast -a app.critterpass.spikeandroid.SIMULATE_PUSH \
  --es type la.leaveby --es op start \
  --es state '{"progress":1,"progressMax":4,"chip":"12 min"}'
```

Or tap the buttons on the `(dev)/spikes/android-surfaces` screen — both call the same
`AndroidSurfacesPushReceiver.handle`.

## OEM notes (fill in as devices are checked)

| Device | OS | Promoted ongoing (`requestPromotedOngoing`) shown? | FSI granted by default? | Exact alarm granted by default? | Notes |
|---|---|---|---|---|---|
| _pending founder run_ | | | | | |

## Founder device checklist

1. Install the EAS `e2e-test` build (`pnpm e2e:cloud -- --platform android --flows e2e/spikes/android-surfaces.yaml`) or a `development` profile build on a physical API 36+ device.
2. Set `GOOGLE_APPLICATION_CREDENTIALS` and `FCM_TEST_DEVICE_TOKEN`, run
   `pnpm --filter @cp/spikes run android-surfaces`, and confirm the Live Update notification
   appears from the real push (not just the local test hook).
3. Long-press the home screen → widgets → "Critterpass spike"; write a snapshot from the
   `(dev)/spikes/app-group` screen and confirm the widget text updates within one manual refresh
   (Glance widgets refresh on their own timeline; `reloadWidgets()` from that screen forces it).
4. Grant full-screen-intent and exact-alarm via the spike screen's settings buttons, schedule the
   alarm, lock the device, and confirm the alarm activity appears over the lock screen at the
   scheduled time. Repeat with both permissions denied and confirm the heads-up notification still
   posts (degrade path).
5. Record OS build, OEM (Samsung/Pixel/etc.), and whether the promoted-notification chip actually
   appeared in the status bar (OEM notification-shade customizations sometimes suppress this) in
   the table above and in the ADR's `Founder device run` table.
