# WeatherAPI.com recorded responses

Real bodies recorded on 2026-09-28 (Asia/Makassar local 01:32) from the development key's plan.
The key was sent as the `key` query parameter and appears nowhere in these files.

| File | Request | Notes |
|---|---|---|
| `forecast-bali-ubud-3d.json` | `GET /v1/forecast.json?q=-8.5069,115.2625&days=3&aqi=no&alerts=yes` | 3 days × 24 hours, empty `alerts` |
| `marine-bali-padang-bai-1d.json` | `GET /v1/marine.json?q=-8.5300,115.5100&days=1` | 1 day × 24 hours; this account returned `water_temp_c` and `tides`, which lower plans omit |
| `error-invalid-key-401.json` | `GET /v1/forecast.json` with an invalid key | HTTP 401, error code 2006 |
