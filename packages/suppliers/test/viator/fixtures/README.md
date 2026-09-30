# Viator published response samples

Response samples from Viator's published Partner API v2 specification
(docs.viator.com/partner-api/technical, OpenAPI 3.0.2, read 2026-09-30), copied verbatim. They
exercise the adapter's request shapes and response mapping; they are not sandbox recordings. The
hold sample's `paymentSessionToken` (a JWT in the spec) is replaced by a placeholder string.
Recorded sandbox responses (search → hold → book → cancel) replace them once our Viator Full +
Booking access is approved and the sandbox key is issued.

| File                              | Operation                                        | Sample          |
| --------------------------------- | ------------------------------------------------ | --------------- |
| `cart-hold-viator-form.json`      | `POST /bookings/cart/hold`                       | `viator-form`   |
| `cart-book-viator-form.json`      | `POST /bookings/cart/book`                       | `viator-form`   |
| `booking-status-1.json`           | `POST /bookings/status`                          | 1 (`CONFIRMED`) |
| `booking-status-2.json`           | `POST /bookings/status`                          | 2 (`PENDING`)   |
| `booking-status-3.json`           | `POST /bookings/status`                          | 3 (`CANCELED`)  |
| `cancel-quote.json`               | `GET /bookings/{booking-reference}/cancel-quote` | 1               |
| `cancel.json`                     | `POST /bookings/{booking-reference}/cancel`      | 1               |
| `modified-since.json`             | `GET /bookings/modified-since`                   | 1               |
| `products-search-affiliates.json` | `POST /products/search`                          | `Affiliates`    |
