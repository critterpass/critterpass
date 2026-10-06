# Critterpass API contracts: suppliers

Companion to [api-contracts.md](./api-contracts.md) — supplier affiliate links, activity bookings (Viator), and order routes.

Status: contract for suppliers (P35) and bookings (P34). Stack: Hono + Zod openapi.

## Commands (section 4.11: Suppliers, rides, vendor desk)

| Command | Payload | Authz | Ent | Events | Surfaces | Phase |
|---|---|---|---|---|---|---|
| `record_supplier_click` | `{offer_ref, supplier, context}` → affiliate URL | self | – | `supplier.link_opened` | A, O | 35 |
| `hold_activity` | `{trip_id, offer_ref, date, time?, pax[], option_code}` → `{hold_id, price_held_until?, seats_held_until?, hold_provided}` | participant | flag `supplier.viator.booking` | `activity.held` | A | 35 |
| `book_activity` | `{hold_id, traveller_details, payment_session_ref}` (payment in Viator iframe; we never see card data) | participant | flag | `activity.booked` / `activity.pending` → voucher into wallet | A | 35 |
| `cancel_activity_booking` | `{booking_id, reason_code}` (quote shown first via GET) | booker / organiser | flag | `activity.cancelled` | A | 35 |
| `release_activity_hold` | `{hold_id}` | holder / S at expiry | – | `activity.hold_released` | A, S | 35 |
| `request_vendor_message` | `{trip_id, vendor_ref, intent, draft_text}` → ops desk queue | participant | – | `vendor_msg.drafted` | A | 35 |
| `approve_vendor_message` | `{draft_id, text}` (user approval of the exact text shown; `STATE_INVALID text_changed` otherwise; ops desk sends via WhatsApp Business) | requester | – | `vendor_msg.approved` | A, N | 35 |
| `send_vendor_message` | `{draft_id}` | ops | approved only (handler + `ops.vendor_messages` trigger: approval text and `approved_text_sha256` equal the body) | `vendor_msg.sent` | X | 35 |
| `set_vendor_contact` (doc delta) | `{thread_id, phone_e164}` (sealed + peppered hash for reply routing) | ops | – | – | X | 35 |
| `propose_vendor_reply` (doc delta) | `{thread_id, draft_id, draft_text}`: a desk follow-up the requester approves like any draft; voids earlier unsent drafts | ops | – | `vendor_msg.drafted` | X | 35 |
| `request_concierge` | `{task_id, trip_id, kind: clinic\|vendor\|other, text}` (human hand-off; one task per `task_id`) | participant | – | `concierge.requested` | A | 35 |
| `log_ride` (doc delta) | `{ride_id, trip_id, leg_ref, provider, amount_minor?, currency?, attendee_ids?, expense_id?, quote_id?}` → `rides` + optional split expense (`source=ride`) | participant | – | `ride.logged` | A, O | 35 |
| `set_entry_reminder` (doc delta) | `{trip_id, must_do_id, closes_at, results_at?, url}` → a reminder per participant a day before close and at results (`setup.lottery_remind` timers); never enters anyone | participant | – | `lottery.reminders_set` | A, O | 35 |
| `share_provider_intake` (doc delta) | `{intake_id, trip_id, kind: text\|link\|image\|contact, text}` (offline; an image is shared as the phone's reading of it) | member | – | – | A | 55 |
| `confirm_provider_fields` (doc delta) | `{provider_id, trip_id, intake_id?, card, confirmed[]}`: every line with a value must be confirmed (`VALIDATION unconfirmed {fields}`), then `providers` (kind driver, number sealed) + `provider_terms` | member | – | – | A | 55 |
| `shortlist_provider` (doc delta) | `{provider_id, trip_id, supplier: klook\|viator, product_id, price_minor, currency, price_unit: car\|group, included_hours, seats}`: product id and shown price only | member | – | – | A | 55 |
| `assign_provider` (doc delta) | `{trip_id, provider_id, days[{date, window_start, window_end, pickup}]}` → `provider_assignments` with the agreed terms; a day set on another driver answers `STATE_INVALID day_taken {dates}` | member | – | – | A | 55 |
| `dismiss_pickup_gap` (doc delta) | `{trip_id, date}` (offline): NOT NOW for the caller only | member | – | – | A | 55 |

Ride quotes (Grab Farefeed) are GET reads; "Open Grab" is a deep link — no ride commands, no live driver. `request_vendor_message` answers `channel: self_send` with a `wa.me` share link while the desk's WhatsApp Business number (`whatsapp_business` partner switch) is off. Travellers read their threads at `GET /v1/trips/{trip_id}/vendor-threads`; WhatsApp replies for the desk number arrive at `/webhooks/whatsapp/vendor` (its own Meta app).

### Ride quote tariff estimate (`fare_estimate`)

`GET /v1/rides/quote?trip_id&to_poi&(from_poi|from=lat,lng)` answers `{copy_key, estimate, fare_estimate, links, phrase_card}`. `estimate` stays Grab's live Farefeed quote and comes first whenever the `grab_farefeed` switch is on and Grab answers. When it is `null` (switch off, Grab not configured or no quote), `fare_estimate` prices the routed trip with the destination's published tariffs; it is `null` when the destination has no tariffs, the api has no Mapbox token, or Mapbox could not route (a straight-line fallback is never priced).

```jsonc
"fare_estimate": {
  "copy_key": "suppliers.rides.tariff_estimate", // the card always says "estimate"
  "distance_m": 3546, "duration_min": 15, "traffic": true, // Mapbox driving-traffic
  "options": [{
    "ride_class": "metered_taxi",          // metered_taxi | ride_hail_car | ride_hail_bike
    "operator": "MK Taxi Kyoto",
    "low_minor": 1440, "high_minor": 2820, "currency": "JPY",
    "basis": "meter_tariff",               // meter_tariff | regulated_band | operator_rates
    "peak_factor": null,                   // 1.5 when the high end is the ride-hail peak allowance
    "minimum_applied": false,
    "extras": [{"kind": "dispatch", "amount_minor": 300}], // airport_pickup | dispatch; not in the range
    "crew": {"low_minor": 1309, "high_minor": 2564, "currency": "SGD", "fx_as_of": "2026-10-14", "fx_stale": false}, // null without a rate or when the crew pays in the local currency
    "sources": [{"url": "https://www.mk-group.co.jp/kyoto/taxi/", "covers": "…", "checked_on": "2026-09-30"}],
    "checked_at": "2026-09-30",            // oldest check date behind the range
    "reviewed": false                      // true once the owner has published the tariff batch
  }]
}
```

- **Low end:** the standard rates over the route: flag fall, distance beyond what it covers (with a later per-km rate where the tariff has one), and time where the tariff charges every minute.
- **High end:** the upper rates where the tariff publishes them (a regulator's upper band, a meter's night rates). Ride-hail classes without them use the standard fare × 1.5 (`peak_factor`; operators publish no surge cap). Meters that charge time only in slow traffic add every minute in traffic on the high end.
- Both ends respect the minimum fare. Low rounds down and high rounds up to the local unit (IDR 1,000, JPY 10, EUR 0.50, ISK 100). `crew` converts both ends with the latest stored FX snapshot.
- **Tariff data:** the `ride_tariffs` content kind. It is built by the content factory (`pnpm content ride_tariffs run`) from hand-researched records, and reviewed and approved in the console like every batch. The api reads the live release (`reviewed: true`), or else the newest batch still in review (`reviewed: false`).

## Routes (supplier order flow and attribution)

### Drivers (doc delta)

- `GET /v1/drivers?trip_id=`: the trip's shared driver messages (never synced: they carry a third party's number) and the shortlist with each driver's number opened for the crew.
- `POST /v1/drivers/intake/{id}/read` → `{intake_id, status: parsed|failed, parsed: {card, spans, unreadable, cut_off}}` (route `provider.extract`; a field whose quoted words are not in the message is dropped, and a phone number only survives when its digits are there).
- `GET /v1/drivers/private-tours?trip_id&days` → `{area, people, cards[], supplier_down, links[{partner, api, target}]}`: Viator cards verbatim when its switch is on and a destination ref is given, never stored; otherwise link rows that open through `record_supplier_click`.

### Affiliate attribution bridge

| Route | Purpose | Auth | Response |
|---|---|---|---|
| `GET /v1/suppliers/r/{sub_id}` | Public redirect bridge behind `go.critterpass.app/r/{sub_id}` (partner link resolver). An offline tap opens the bridge at once with the app's own sub id; once the click has synced the bridge redirects to the partner link built for it. Unknown sub id → `404 NOT_FOUND`. Never cached; headers: `Cache-Control: no-store`, `Referrer-Policy: no-referrer` | public | `302` to partner link URL |

### Activity booking flow

| Route | Purpose | Auth | Response | Errors |
|---|---|---|---|---|
| `GET /v1/suppliers/offers` | Viator products for a destination and date, fetched per view, verbatim and attributed. Query: `trip_id` (uuid), `destination_ref` (Viator id), `date` (ISO date), `currency` (ISO 4217). Never cached or stored (supplier content) | session | `{attribution: "viator", offers: […]}` | `SUPPLIER_UNAVAILABLE` (adapter off or Viator down), `NOT_FOUND{reason: "trip"}` (not a trip member), `VALIDATION` (query params) |
| `GET /v1/suppliers/payment-session/{hold_id}` | Viator hosted payment form URL for a held order (3DS inside; no card data reaches us). Opens it when opening the iframe; moves the order to `awaiting_payment`. Invalid/expired hold → errors | session | `{hold_id, payment_session_token, hold_valid_until?: iso8601}` | `HOLD_EXPIRED`, `NOT_FOUND{reason: "order"}` (not the buyer), `STATE_INVALID{state: …}` (order not payable), `SUPPLIER_UNAVAILABLE` |
| `GET /v1/suppliers/bookings/{id}/cancel-quote` | Viator refund calculation for a confirmed booking (`supplier_orders.status = 'confirmed'`). Shown before the cancel command | session | `{cancellable: bool, refund_minor: int, currency: ISO 4217, refund_note: string}` | `NOT_FOUND` (booking not found or not a supplier order), `SUPPLIER_UNAVAILABLE`, `STATE_INVALID` |

## Error codes (additions for suppliers)

| Code | HTTP | Retry | Meaning |
|---|---|---|---|
| `HOLD_EXPIRED` | 409 | no | Viator hold lapsed → re-check availability |
| `HOLD_NOT_PROVIDED` | 200 | – | Result flag; copy says "seats not held" |
| `SUPPLIER_UNAVAILABLE` | 503 | yes | Adapter flag off or upstream down |
| `SUPPLIER_REJECTED` | 422 | no | Upstream business reject, `detail.supplier_code` |

---

## Unresolved

- Payment session route requires session; confirm whether offline flows will need internal door or a long-lived token.
- Refund calculation quotation (cancel-quote) is informational only; cancellation itself happens through `cancel_activity_booking` after user approval.
