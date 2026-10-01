-- The language a person reads the app in, resolved in one place for everything the server writes
-- to them (guide replies, push text, translations of guide-written text).
--
-- `user_settings.app_locale` is what the app reports once it has picked its own UI language
-- (`set_app_locale`). An install that has not reported yet falls back to its newest device's
-- locale tag, then to the account's locale, each mapped the way the app maps a device preference
-- onto the languages it ships: same language wins (a `zh-Hant` phone reads the shipped `zh-Hans`),
-- anything else reads English.

CREATE FUNCTION app.shipped_locale(tag text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT CASE split_part(lower(replace(tag, '_', '-')), '-', 1)
    WHEN 'en' THEN 'en'
    WHEN 'zh' THEN 'zh-Hans'
    WHEN 'id' THEN 'id'
    WHEN 'in' THEN 'id' -- the legacy ISO 639 code some Android builds still report
    WHEN 'ja' THEN 'ja'
    WHEN 'es' THEN 'es'
    WHEN 'pt' THEN 'pt'
    WHEN 'fr' THEN 'fr'
    WHEN 'ko' THEN 'ko'
    WHEN 'th' THEN 'th'
    WHEN 'vi' THEN 'vi'
  END
$$;

-- Runs with the caller's rights: a signed-in user resolves only from rows RLS already lets them
-- read (their own settings and devices, and the account row crewmates can see anyway), so the
-- function exposes nothing new; app_system resolves anyone.
CREATE FUNCTION app.user_locale(member uuid) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT coalesce(
    (SELECT app.shipped_locale(s.app_locale) FROM user_settings s WHERE s.user_id = member),
    (SELECT app.shipped_locale(d.locale) FROM devices d
      WHERE d.user_id = member ORDER BY d.last_seen_at DESC NULLS LAST LIMIT 1),
    (SELECT app.shipped_locale(u.locale) FROM users u WHERE u.id = member),
    'en'
  )
$$;

REVOKE EXECUTE ON FUNCTION app.shipped_locale(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.user_locale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.shipped_locale(text) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.user_locale(uuid) TO app_user, app_system;
