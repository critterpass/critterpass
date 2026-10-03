-- `ai_usage.tier` gains `gemini`: the vision fallback that reads text-less screenshots and public
-- videos when adding places from a link, off until `ai.gemini_vision` is switched on. Its spend is
-- recorded and capped like every other tier. The CHECK list is rewritten whole and must equal the
-- domain's AI_TIERS (packages/db/test/permissions/ai-usage.test.ts compares them). Expand-only:
-- every existing row already holds one of the kept tiers.

ALTER TABLE ai_usage DROP CONSTRAINT IF EXISTS ai_usage_tier_check;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_tier_check
  CHECK (tier IN ('fast', 'pro', 'jev', 'gemini'));
