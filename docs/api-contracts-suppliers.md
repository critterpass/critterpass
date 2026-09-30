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

Ride quotes (Grab Farefeed) are GET reads; "Open Grab" is a deep link — no ride commands, no live driver. `request_vendor_message` answers `channel: self_send` with a `wa.me` share link while the desk's WhatsApp Business number (`whatsapp_business` partner switch) is off. Travellers read their threads at `GET /v1/trips/{trip_id}/vendor-threads`; WhatsApp replies for the desk number arrive at `/webhooks/whatsapp/vendor` (its own Meta app).

## Routes (supplier order flow and attribution)

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
