-- Decision calls on TypeSafe's Jev join the usage ledger (docs/decisions/20260927-jev-decision-model.md):
-- `ai_usage.tier` gains `jev` beside the Claude tiers. The CHECK list is rewritten whole, so it must
-- keep every existing tier; packages/db/test/permissions/ai-usage.test.ts compares it with the
-- domain's AI_TIERS.

ALTER TABLE ai_usage DROP CONSTRAINT ai_usage_tier_check;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_tier_check
  CHECK (tier IN ('haiku', 'sonnet', 'opus', 'jev'));
