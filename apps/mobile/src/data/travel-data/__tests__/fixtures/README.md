# Recorded api responses

Bodies recorded on 2026-09-28 from the real `services/api` travel-data routes, served by the api's
database test harness (`services/api/test/travel-data/*.db.test.ts`: real Postgres, real session,
rows shaped as the worker jobs write them). The app hooks read these through the same parsers
they use against the live api.

`media-da-nang.json` was recorded on 2026-10-01 from the staging database through the api's own
`readEditorialMedia` (`GET /v1/media?subjects=destination:da-nang`) after the Đà Nẵng media batch
was published and ingested.

`ideas-board*.json`, `help-library-*.json`, `season-*.json`, `cost-indices-*.json` and `crowd-forecasts-shrine.json` follow
the shared content routes' answers field for field (`services/api/src/routes/{help-ideas,help-library,
destination-season,destination-cost-indices,place-crowd-forecasts}.ts`, whose bodies
`services/api/test/routes/shared-content.db.test.ts` checks against real Postgres); the destination
ids match the app tests' seeded trips.
