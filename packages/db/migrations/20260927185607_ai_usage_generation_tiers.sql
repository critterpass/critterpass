-- Generation moves to DeepSeek: a fast tier and a pro tier replace
-- the three Claude tiers in `ai_usage.tier`. Existing rows keep their real model id in `model` and
-- take the tier with the same role (haiku → fast, sonnet and opus → pro). The CHECK list is
-- rewritten whole and must equal the domain's AI_TIERS
-- (packages/db/test/permissions/ai-usage.test.ts compares them). Safe to run on any row set: the
-- updates touch only old tier values and the constraint is dropped before they run.

ALTER TABLE ai_usage DROP CONSTRAINT IF EXISTS ai_usage_tier_check;
UPDATE ai_usage SET tier = 'fast' WHERE tier = 'haiku';
UPDATE ai_usage SET tier = 'pro' WHERE tier IN ('sonnet', 'opus');
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_tier_check CHECK (tier IN ('fast', 'pro', 'jev'));
