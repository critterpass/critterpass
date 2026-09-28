-- ai_usage.route: the gateway route of each model call (`guide.chat`, `draft.skeleton`, the
-- decision routes, ...), so spend is attributable per route from now on and the cost guard can
-- sum a day's spend per tier and route. Earlier rows keep a null route.
ALTER TABLE ai_usage ADD COLUMN route text CHECK (route ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$');
CREATE INDEX ai_usage_route_at_idx ON ai_usage (route, at DESC);

-- The new column joins admin_reader's generated column grant (privacy map, class C5).
GRANT SELECT (route) ON ai_usage TO admin_reader;
