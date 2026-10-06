# Google Play policy declarations

What CritterPass declares in the Play Console for its sensitive Android permissions and
notification features, with the justification text to paste, where the UX evidence comes from and
what the app does when the permission is missing. The code lives in
`apps/mobile/modules/cp-android-surfaces` (permissions written by
`apps/mobile/plugins/with-android-surfaces.ts`), `apps/mobile/modules/cp-alarm` (leave-by alarm
scheduling and the full-screen alarm) and `apps/mobile/plugins/with-location-permissions.ts`.

Every grant below is **denied by default** and the app is fully usable without it; each one is
requested only from an explainer row (`apps/mobile/src/features/you/android-permissions`) that
opens the system settings page, and re-checked every time the app returns to the foreground.

Screenshots for the Console come from the device workflow (`device.yml`, `mode=capture`) on the
routes listed under "Evidence".

## Full-screen intent (`USE_FULL_SCREEN_INTENT`)

- **Use:** the user-set leave-by alarm only (5b-3): the person sets a time to leave for a flight,
  pickup or tour, and the alarm wakes them over the lock screen with a slide-to-confirm "I'm up".
- **Declaration:** CritterPass is neither a calling nor an alarm-clock app, so Android 14+ does not
  grant this permission automatically. Justification: "Users set a leave-by alarm for a trip
  departure (flight, pickup, tour). With their permission, the alarm shows full screen over the
  lock screen so they wake in time; it is never used for any other notification."
- **Request path:** the full-screen explainer row ("Alarms show as a banner…", Open Settings) →
  `Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT`.
- **Without it (default):** a heads-up alarm notification on the alarm channel (`cp_alarm`,
  `USAGE_ALARM`) plus the leave-by Live Update. The server can also switch the full-screen path off
  for everyone (`android.fsi.enabled`), which falls back the same way.
- **Evidence:** the alarm explainer row; the alarm screen on a device with the grant; the heads-up
  alarm on a fresh install.

## Exact alarms (`SCHEDULE_EXACT_ALARM`; never `USE_EXACT_ALARM`)

- **Use:** ringing the leave-by alarm at the minute the user chose (`AlarmManager.setAlarmClock`).
- **Declaration:** only `SCHEDULE_EXACT_ALARM`, which the user grants and can revoke.
  `USE_EXACT_ALARM` is reserved for alarm-clock and calendar apps; the config plugin removes it
  from the merged manifest (`tools:node="remove"`) so no library can add it.
- **Request path:** the exact-alarm explainer row ("Leave-by alarms may ring a few minutes late…")
  → `Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM`;
  `canScheduleExactAlarms()` is re-read on resume and on
  `SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`, and every stored alarm is set again.
- **Without it (default on Android 13+):** an inexact `setAndAllowWhileIdle` alarm with an earlier
  warning notification, so a late ring still leaves time to go.

## Do Not Disturb access for SOS (`ACCESS_NOTIFICATION_POLICY`)

- **Use:** a crewmate's SOS rings through Do Not Disturb. Android only honours a channel's
  `setBypassDnd(true)` for apps with notification-policy access, so the bypassing channel
  (`cp_sos_dnd`, alarm sound, high importance) is created only after the user grants access.
- **Request path:** the SOS explainer row ("A crewmate's SOS stays silent in Do Not Disturb…") →
  `Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS`.
- **Without it (default):** SOS posts on `cp_sos` (high importance) and respects Do Not Disturb; the
  settings row stays visible.
- **Never used for:** changing the user's DND mode or any other notification.

## Promoted notifications and Live Updates (`POST_PROMOTED_NOTIFICATIONS`)

- **Use:** Live Updates (Android 16+, `Notification.ProgressStyle`; `MetricStyle` on Android 17+)
  for ongoing activities the user started.
- **Initiator rule (Play: Live Updates only for user-initiated ongoing activities):**

  | Activity | Live Update on | Everyone else |
  |---|---|---|
  | Leave-by | each member who set the leave-by or its alarm | nothing (their own alarm covers it) |
  | Flight | members who track the flight | high-priority notification on status change |
  | Meet-up | the member who started it and members who tapped ON MY WAY | high-priority notification |
  | Critter nearby | the member who started the hunt or opted into nearby alerts | standard notification |
  | SOS | the sender | `cp_sos` high-priority notification |
  | Crew lock-screen offer (Boost) | members who opt in | ongoing notification with an opt-in action |
  | Vote, storm | never a Live Update | high-priority notification |

  The worker applies the rule per device (`services/worker/src/push/fcm-surfaces.ts`).
- **Without promotion (below Android 16, or switched off by the user):** the same content as a
  standard ongoing notification; a settings row links to
  `Settings.ACTION_APP_NOTIFICATION_PROMOTION_SETTINGS`.

## Foreground service types

- `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION` are declared for live location sharing on
  trip days (crew map, help share), started only from a visible user action, with the ongoing
  notification Android requires. No other foreground service type is declared.
- Queued notification and widget actions are sent with expedited WorkManager jobs; below Android
  12 these run as a brief foreground job with a "Sending your answer" notification (no
  location, no microphone).

## Background location (`ACCESS_BACKGROUND_LOCATION`)

- **Use:** on trip days only, so leave-by times, crew meet-ups and critter spawns stay current
  while the phone is in a pocket. Coordinates never appear in notifications, widgets or Live
  Updates (ETA text only).
- **Request path:** the location primer offers "while using" first; "all the time" is a second,
  separate ask with its own explainer, and the app works with "while using" only.
- **Declaration:** the Console video shows the primer, the system prompt and the trip-day map. Data
  safety pointers are maintained with the store listing (location: collected, not shared, optional).

## Widgets, lock-screen hub and screen saver

No special permission. Lock-screen widgets are offered only where a runtime probe passes (Android
16 QPR2+ on large screens); the sleepy-clock screen saver is listed as "while charging" because
Android only runs it then.
