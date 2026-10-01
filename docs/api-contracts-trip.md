# Critterpass API contracts: trip day-of

Companion to [api-contracts.md](./api-contracts.md) (disruptions in full: [api-contracts-disruptions.md](./api-contracts-disruptions.md)) — leave-bys, readiness tracking, briefings, packing, disruptions, help, SOS, location sharing, and crew meetups. Real-time channels and offline bundle manifest structure.

Status: contract for day-of, disruptions, help, map (P36–P39). Stack: Hono + Zod openapi + Centrifugo.

## Commands (section 4.12: Trip day, disruptions, help, map)

| Command | Payload | Authz | Ent | Events | Surfaces | Phase | Action Key Scope |
|---|---|---|---|---|---|---|---|
| `set_readiness` | `{leave_by_id, state: up\|not_up, source}` | participant on item | – | `readiness.changed` (LA broadcast, `trip_dayof`) | A, O, L, N, W, I | 36 | `readiness` |
| `snooze_leave_by` | `{leave_by_id, count}` (server decides crew knock at 2nd) | participant | – | `leave_by.snoozed` (N-21) | L, A | 36 | – |
| `check_packing_item` | `{item_id, checked}` | participant | – | `packing.checked` | A, O | 36 | – |
| `act_briefing_item` | `{item_id, action: done\|nudge\|set\|open}` | self | – | `briefing.item_acted` | A, O, N | 36 | – |
| `report_running_late` | `{trip_id, item_id\|meetup_id, minutes}` | participant | – | `member.running_late` (N-23) + chat msg | A, O, L, N, I | 36 | – |
| `ping_all` | `{trip_id, kind: on_my_way\|ping}` | participant | `boostActive(t)` | `crew.pinged` (N-23) | A, L, I | 39 | – |
| `decide_disruption_action` | `{disruption_id, action_id, decision}` | affected member (money/others → needs yes) | – | `disruption.action_decided` | A, N | 37 | – |
| `undo_disruption_action` | `{disruption_id, action_id}` | approver | reversible only | `disruption.action_undone` | A, N | 37 | – |
| `announce_disruption` | `{disruption_id}` | organiser or a disrupted traveller | – | `disruption.announced` | A | 37 | – |
| `choose_late_option` (doc delta) | `{disruption_id, option_id: push\|walk\|skip\|car}` | member of the late party | – | `late_option.chosen` + chat line to whoever waits | A, O | 37 | – |
| `dismiss_weather_suggestion` (doc delta) | `{changeset_id}` | participant | – | `weather.suggestion_dismissed` | A, O | 37 | – |
| `hold_storm_seats` (doc delta) | `{disruption_id, hold_id}` | the original booker | – | as `hold_activity` | A | 37 | – |
| `start_help_share` | `{trip_id, reason, ttl_min}` | participant | – (helpMap) | `help_share.started` (N-25) | A | 38 | – |
| `stop_help_share` / `extend_help_share` | `{share_id, ttl_min?}` | owner | – | `help_share.stopped/extended` | A, N | 38 | – |
| `trigger_sos` | `{trip_id, text?, fix?}` (confirm step on surfaces) | participant | – | `sos.triggered` (N-24, deterministic fan-out first) | A, L, I | 38 | – |
| `respond_sos` | `{sos_id, state: coming\|seen\|calling}` | crew | – | `sos.responded` | A, N | 38 | – |
| `send_sos_message` | `{sos_id, body}` | crew | – | `sos.message` | A, O | 38 | – |
| `resolve_sos` | `{sos_id, note?}` | sender / responder | – | `sos.resolved` (N-48) | A, N | 38 | – |
| `set_location_share` | `{trip_id, status: on\|off}` (window ends last-day midnight; a `location.expire` timer announces the end and unsubscribes when the map closes; `off` always allowed) | participant | `boostActive(t)` except Help/SOS | `location_share.changed` | A, O | 39 | – |
| `pause_location_share` (doc delta) | `{share_id, paused}` | share owner | resume: `boostActive(t)` + trip days; pause always | `location_share.changed` + `share.paused`/`share.resumed` on `trip_locations` | A, O | 39 | – |
| `report_location_fixes` | `{trip_id, fixes[{lat, lng, acc, at, mode?}]}` via `POST /v1/trips/{id}/fixes` (TTL rows, not synced) | sharing participant | same | `trip_locations` publish | A (bg) | 39 | – |
| `create_meetup` / `move_meetup` | `{trip_id, meetup_id?, poi_id\|point{lat, lng, name}, at}` / `{meetup_id, poi_id?\|point?, at?}`; one active meet-up per trip (`STATE_INVALID meetup_exists`) | participant | `boostActive(t)` + trip days (`NOT_ELIGIBLE outside_trip_days`) | `meetup.created/moved` (N-47) | A | 39 | – |

**Action key scopes:** Only `set_readiness` accepts the `readiness` action key scope for Notification, Live Activity, and widget surfaces. Other trip-day commands are app-only or deep-link-only.

**Crew knock:** At the 2nd snooze of a leave-by, the server sends a crew knock (push + LA broadcast) on `trip_dayof:` to all crew members who haven't marked themselves ready, mentioning the snoozed member. Suppressed by `leave_by_dnd` in notification prefs.

## Realtime channels

| Channel | Subscribers | Data source | Privacy | Contents |
|---|---|---|---|---|
| `trip_dayof:{trip_id}` | participants in-trip or pre-trip | `rt_outbox` | trip-level | `readiness` row snapshots (`leave_by_id`, `up[]` user ids, `total` count), `packing.checked` item changes, `leave_by.changed` (state, time fields), crew knock announcements (pub-only) |

Updates on `trip_dayof:` drive live readiness sheets, packing progress, and leave-by countdowns on all devices. A change nothing (toggled back to the same state) publishes nothing.

## Routes

| Route | Purpose | Auth | Response |
|---|---|---|---|---|
| `GET /v1/trips/{id}/offline-bundle?date=YYYY-MM-DD` | Pre-assembled day bundle for offline use; served during `pre_trip` phase onwards. Contains briefing, packing, leave-bys, readiness row locks, cost data, plan items for the day and media keys. Cache: 1 day. Archived trips: 7-day TTL on the response | session | Bundle manifest (see below) |

### Offline bundle manifest structure

Manifest JSON keys (see `offline_bundles.manifest` in data-model.md):

```json
{
  "briefing": {
    "trip_id": "uuid",
    "user_id": "uuid",
    "local_date": "YYYY-MM-DD",
    "status": "ready|empty|failed",
    "items": [
      {
        "id": "uuid",
        "position": 0,
        "icon": "string",
        "text": "string",
        "action": "done|nudge|set|open",
        "status": "open|done|nudged|set|opened",
        "deepLink": "string or null"
      }
    ]
  },
  "packing": [
    {
      "id": "uuid",
      "label": "string",
      "checked": false,
      "suggestedBy": "user|guide",
      "ownerId": "uuid or null"
    }
  ],
  "leaveBys": [
    {
      "id": "uuid",
      "planItemId": "uuid",
      "title": "string",
      "leaveAt": "2026-09-30T14:30:00Z",
      "pickupAt": "2026-09-30T14:15:00Z or null",
      "state": "scheduled|window|alerting|departed|cancelled",
      "legs": [],
      "alarmPolicy": { "leadMin": 10, "onlyIfNotUp": true, "snoozeLimit": 1 },
      "progressMode": "time|location",
      "participantIds": ["uuid"]
    }
  ],
  "readiness": [
    {
      "leaveById": "uuid",
      "userId": "uuid",
      "state": "not_up|up|ready|left",
      "snoozeCount": 0
    }
  ],
  "days": [
    {
      "dayNo": 1,
      "date": "2026-09-30",
      "planItemIds": ["uuid"],
      "costData": {
        "tripShareTotal": {
          "amountMinor": 50000,
          "currency": "USD"
        }
      },
      "mediaKeys": ["key1"]
    }
  ]
}
```

**Retention:** Manifests built at start of day-of phase; cleared 1 day after trip archive.

---

## Unresolved

1. Crew knock throttling: confirm cadence and target audience (ready members exempt or always receive?).
2. Location-mode leave-bys: the progress-mode logic for geofence-based departure detection.
3. Offline bundle refresh cadence during `pre_trip` and `in_trip` phases.
