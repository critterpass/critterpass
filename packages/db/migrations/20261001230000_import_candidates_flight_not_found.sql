-- A pasted flight number on its own is looked up in the flight's published schedule. When nothing
-- matches (or there is no date to look on) the candidate fails with `flight_not_found`, and the app
-- asks for the date and route instead of saying it could not read the paste.

ALTER TABLE import_candidates DROP CONSTRAINT import_candidates_failure_reason_check;
ALTER TABLE import_candidates ADD CONSTRAINT import_candidates_failure_reason_check
  CHECK (failure_reason IN ('unreadable', 'unsupported_attachment', 'empty', 'no_booking',
                            'fetch_failed', 'blocked_url', 'flight_not_found'));
