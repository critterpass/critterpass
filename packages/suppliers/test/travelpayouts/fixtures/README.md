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
