# Recorded api responses

Bodies recorded on 2026-09-28 from the real `services/api` travel-data routes, served by the api's
database test harness (`services/api/test/travel-data/*.db.test.ts`: real Postgres, real session,
rows shaped as the worker jobs write them). The app hooks read these through the same parsers
they use against the live api.
