# Travelpayouts recorded responses

Real `GET https://api.travelpayouts.com/aviasales/v3/prices_for_dates` bodies, recorded on
2026-09-28 with `one_way=false&direct=false&sorting=price&unique=false&currency=usd&limit=30&page=1`
and `departure_at`/`return_at` set to the file's month. The token was sent in the `X-Access-Token`
header and appears nowhere in these files.

| File                                    | origin | destination | month   | Result         |
| --------------------------------------- | ------ | ----------- | ------- | -------------- |
| `prices-for-dates-sin-dps-2026-11.json` | SIN    | DPS         | 2026-11 | 18 round trips |
| `prices-for-dates-sin-kix-2027-04.json` | SIN    | KIX         | 2027-04 | 2 round trips  |
| `prices-for-dates-han-cuz-2027-02.json` | HAN    | CUZ         | 2027-02 | empty `data`   |

## Partner links and booking statistics

| File                                       | Source                                                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `links-create-invalid-marker.json`         | Recorded 2026-09-30: `POST /links/v1/create` with our token and no partner marker (HTTP 400).                                                                                                                      |
| `links-create-published-sample.json`       | Travelpayouts' published response samples for `POST /links/v1/create` ("API for Travelpayouts partner links"): one converted link, one brand the project is not subscribed to, one unsupported brand, in one body. |
| `statistics-actions-since-2026-09-01.json` | Recorded 2026-09-30: `POST /statistics/v1/execute_query` for actions since 2026-09-01 (no bookings yet: empty `results`).                                                                                          |
| `statistics-actions-published-sample.json` | Travelpayouts' published `execute_query` response sample ("API of affiliate programs booking statistics"), with the `_usd` field names the documented request asks for (the page's own sample prints `_eur`).      |

Converted-link fixtures are re-recorded once the account's partner marker and project id are set
(`TRAVELPAYOUTS_MARKER`, `TRAVELPAYOUTS_TRS`).
