-- llm.plan_version_days: the trip's current crew plan version and its days, for the guide. A plan
-- with no items is still a plan, and llm.plan_items (one row per item) cannot show it: without its
-- version the guide could not propose the first item for a day. One row per day; a version with no
-- days yet still gives one row with a null day. Members of the trip in context only (app.trip),
-- like llm.plan_items; organiser drafts are not the crew's plan and stay out.

CREATE VIEW llm.plan_version_days AS
SELECT iv.id AS version_id, d.day_no, d.date
FROM trips t
JOIN itinerary_versions iv ON iv.id = t.current_version_id
LEFT JOIN plan_days d ON d.version_id = iv.id
WHERE t.id = nullif(current_setting('app.trip', true), '')::uuid
  AND app.is_trip_member(t.id)
  AND iv.visibility = 'crew';

GRANT SELECT ON llm.plan_version_days TO guide_reader;
