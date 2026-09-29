# Monetization: store sandbox and RevenueCat setup

What has to exist outside the repo before a purchase can be tested end to end, and how an agent
runs the store sandboxes. Until each piece exists, `billing.enabled` stays off and the app hides
purchase buttons; entitlements keep resolving from codes, support grants and first trip free.

## 1. Accounts (founder)

| Where | What | Needs |
|---|---|---|
| App Store Connect | Paid Apps agreement, tax and banking | the legal entity |
| App Store Connect | Subscription group "Pass+": `pass_monthly` (USD 3.99 tier), `pass_yearly` (USD 29.99 tier). Separate group "Crew yearly": `boost_crew_year` (USD 59.99 tier). Consumables: `boost_trip` (USD 11.99 tier), `gift_pass_3m`. Family Sharing off, no introductory offer | agreement active |
| App Store Connect | In-app purchase key (Users and Access → Integrations → In-App Purchase): issuer id, key id, `.p8` | for RevenueCat and for support's renewal extension |
| App Store Connect | Sandbox testers (one per agent device) | — |
| Play Console | Subscriptions `pass` (base plans `monthly`, `yearly`) and `boost-crew-year`; one-time products `boost_trip`, `gift_pass_3m`; internal test track with the testers | merchant account |
| Play Console | Real-time developer notifications to RevenueCat's Pub/Sub topic; a service account RevenueCat can use | — |
| RevenueCat | One project with the iOS and Android apps; products imported; entitlement `pass_plus`; webhook to `https://api.critterpass.app/webhooks/revenuecat` (staging: the staging api) with an Authorization header value of your choosing; restore behaviour **Keep with original App User ID** (purchases never move between Critterpass accounts) | the store pieces above |

Store product ids go into `products.store_ids` (`{"app_store": "...", "play": "pass:monthly"}`), or
use the product key itself as the store id. Prices are never in code: the app shows the store's
own `displayPrice`; the server takes the charged price from RevenueCat's event.

## 2. Secrets (Railway variables, never committed)

| Service | Variable |
|---|---|
| api | `REVENUECAT_SECRET_API_KEY` (v1 secret key), `REVENUECAT_WEBHOOK_AUTH` (the exact Authorization header value set in RevenueCat), optional `REVENUECAT_WEBHOOK_SIGNING_SECRET`, `BILLING_INTERNAL_SECRET` |
| api (support's renewal extension) | `APP_STORE_ISSUER_ID`, `APP_STORE_KEY_ID`, `APP_STORE_PRIVATE_KEY_PEM`, `APP_STORE_BUNDLE_ID`, `APP_STORE_ENVIRONMENT` (`sandbox` or `production`) |
| worker | `API_INTERNAL_URL=http://api.railway.internal:8787`, `BILLING_INTERNAL_SECRET` (same value as the api's) |

Then an owner turns `billing.enabled` on in the console (Services).

## 3. Running the sandboxes

- **iOS simulator, no accounts**: the StoreKit configuration file (`apps/mobile/ios/Critterpass.storekit`)
  mirrors the products. StoreKit test purchases never reach RevenueCat's servers, so
  `fulfil_purchase` answers `transaction_unverified`; use it for purchase UI states only.
- **iOS sandbox**: a development build on a device or simulator signed in with a sandbox tester.
  Buy, then check in the console (Billing → customer uid) that the subscription is `active`, the
  RevenueCat event is applied and Pass+ is on. Sandbox renewals are minutes long: a monthly
  subscription renews every 5 minutes, six times, then expires, which exercises renewal and
  expiration.
- **Play internal test track**: install from the track with a tester account; test cards cover
  success, decline (billing issue) and slow card (pending).
- **Replaying an event**: Billing → failed webhooks, or `replay_webhook {provider: "revenuecat",
  event_id}` (ops). Applying an event twice changes nothing.
- **Refunds**: request one in the sandbox (App Store: `requestRefund` sheet; Play: Order management).
  The boost is revoked, its unpaid IOUs reversed, paid ones left alone.

## 4. What to check after each purchase

| Purchase | Check |
|---|---|
| Pass+ | `subscriptions.status` active, `user_entitlements.pass_plus` true, a second device updates within seconds (`entitlement.changed`) |
| Trip Boost (split) | `trip_boosts` active on the locked trip, one `boost` expense, one `boost_iou` entry per member summing to the charged price, `trip_entitlements.boost_active` |
| Crew yearly | a `crew_year_grants` row for the crew, every crew trip boosted, the buyer has Pass+; renewals add no IOUs |
| Billing issue (decline card) | status `grace`, Pass+ on until 7 days after the failure, then `billing_retry` (App Store) or `on_hold` (Play) |
