-- LLM context views (docs/data-model-sync-and-privacy.md §2): the guide's only window onto
-- Postgres. The context builder runs as `guide_reader` with `app.uid` (the asking user) and
-- `app.trip` (the trip in context) set; every view filters by those settings. Plain views owned by
-- the migration role, like llm.pois: guide_reader holds SELECT on the view and nothing on its base
-- tables.
--
-- Ownership rule: this migration creates the views whose base tables already exist. A view over a
-- table a later area creates (bookings, money_summary, chat_window, phrase_cards, help_articles) is
-- added by that area's own migration, and a column that needs a later table (taste tags, budget
-- band, dietary flags) is appended there with CREATE OR REPLACE VIEW.

-- The view predicates below call app.is_trip_member(); function EXECUTE is checked against the
-- querying role, so guide_reader needs it (the function itself stays SECURITY DEFINER).
GRANT EXECUTE ON FUNCTION app.is_trip_member(uuid) TO guide_reader;

-- Trip header and who is on it: display names and RSVP only. No budget maxes, calendars,
-- engagement or contact data; the caller must be a member of the trip in context.
CREATE VIEW llm.trip_context AS
SELECT
  t.id AS trip_id,
  t.crew_id,
  t.status,
  t.phase,
  t.start_date,
  t.end_date,
  coalesce(t.tz, d.tz) AS tz,
  coalesce(t.local_currency, d.currency) AS local_currency,
  t.seat_cap,
  t.is_solo,
  t.is_guest_guide,
  t.destination_id,
  d.name AS destination_name,
  d.country AS destination_country,
  g.slug AS guide_slug,
  (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', tp.user_id,
          'display_name', u.display_name,
          'role', tp.role,
          'rsvp', tp.rsvp
        )
        ORDER BY tp.role, u.display_name
      ),
      '[]'::jsonb
    )
    FROM trip_participants tp
    JOIN users u ON u.id = tp.user_id
    WHERE tp.trip_id = t.id
  ) AS participants
FROM trips t
LEFT JOIN destinations d ON d.id = t.destination_id
LEFT JOIN guides g ON g.id = t.guide_id
WHERE t.id = nullif(current_setting('app.trip', true), '')::uuid
  AND app.is_trip_member(t.id);

-- Approved persona releases only; drafts never reach a production prompt.
CREATE VIEW llm.persona_packs AS
SELECT
  pp.id,
  g.slug AS guide_slug,
  pp.version,
  pp.system_prompt_ref,
  pp.style,
  pp.lexicon,
  pp.voice_settings,
  pp.approved_at
FROM persona_packs pp
JOIN guides g ON g.id = pp.guide_id
WHERE pp.status = 'approved';

-- The asking user's own guide preferences; never another user's row.
CREATE VIEW llm.user_prefs AS
SELECT
  s.user_id,
  s.chattiness,
  s.app_locale,
  s.talk_out_loud,
  s.crew_chat_mode,
  s.price_display,
  s.time_format,
  s.distance_unit
FROM user_settings s
WHERE s.user_id = app.uid();

GRANT SELECT ON llm.trip_context, llm.persona_packs, llm.user_prefs TO guide_reader;
