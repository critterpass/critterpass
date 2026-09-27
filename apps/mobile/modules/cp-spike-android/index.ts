import { cpSpikeAndroidNativeModule } from './src/CpSpikeAndroidModule';
import type { LiveUpdatePushPayload } from './src/CpSpikeAndroid.types';

export type { LiveUpdatePushPayload, LiveUpdatePushState } from './src/CpSpikeAndroid.types';

/**
 * API 34+ requires the user to grant "use full-screen intent" per app
 * (`Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT`); below 34 it's a normal manifest
 * permission, granted at install time. Mirrors `FullScreenIntentGate.decide` on the Kotlin side.
 */
export function canUseFullScreenIntent(): boolean {
  return cpSpikeAndroidNativeModule.canUseFullScreenIntent();
}

/** Opens the per-app full-screen-intent settings screen (the denied-path deep link). */
export function openFullScreenIntentSettings(): void {
  cpSpikeAndroidNativeModule.openFullScreenIntentSettings();
}

/** API 31+ `AlarmManager.canScheduleExactAlarms()`; always true below 31. */
export function canScheduleExactAlarms(): boolean {
  return cpSpikeAndroidNativeModule.canScheduleExactAlarms();
}

/** Opens `Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM` for this app. */
export function openExactAlarmSettings(): void {
  cpSpikeAndroidNativeModule.openExactAlarmSettings();
}

/**
 * Schedules the full-screen-intent alarm `delaySeconds` from now via `AlarmManager.setAlarmClock`
 * (exact, user-visible in the alarm-clock icon) — never `USE_EXACT_ALARM`, which is restricted to
 * alarm-clock/calendar apps (product-decisions.md §4).
 */
export function scheduleFullScreenAlarm(delaySeconds: number): void {
  cpSpikeAndroidNativeModule.scheduleFullScreenAlarm(delaySeconds);
}

/** Cancels a previously scheduled alarm, if any. */
export function cancelFullScreenAlarm(): void {
  cpSpikeAndroidNativeModule.cancelFullScreenAlarm();
}

/**
 * Local test hook for the FCM data-message receiver path: this environment has no Firebase
 * project (see the ADR), so instead of faking a passing push-delivery test, this calls the exact
 * same `AndroidSurfacesPushReceiver.handle` code `AndroidSurfacesMessagingService.onMessageReceived`
 * would call for a real push — same parsing, same notifier, only the transport differs. An
 * `adb shell am broadcast -a app.critterpass.spikeandroid.SIMULATE_PUSH` hits the identical
 * handler from outside the app, for OEM testing without Metro.
 */
export function simulateLiveUpdatePush(payload: LiveUpdatePushPayload): void {
  cpSpikeAndroidNativeModule.simulateLiveUpdatePush(
    payload.type,
    payload.op,
    JSON.stringify(payload.state),
  );
}

/** Cancels the promoted/ongoing Live Update notification, if one is showing. */
export function dismissLiveUpdate(): void {
  cpSpikeAndroidNativeModule.dismissLiveUpdate();
}
