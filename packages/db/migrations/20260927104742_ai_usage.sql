-- ai_usage (docs/data-model.md §3.18): one row per model call, written by the AI gateway as
-- app_system (packages/ai/src/usage.ts#recordUsage). Cost accounting and the fair-use feed; RLS
-- class S: no app_user grant at all, never published, never in an llm view. A C5 financial record:
-- retained for its window, user link reassigned on account merge and nulled on account purge,
-- which is the only column app_system may ever update.

CREATE TABLE ai_usage (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid REFERENCES users (id),
  trip_id uuid REFERENCES trips (id),
  job_id uuid,
  model text NOT NULL,
  tier text NOT NULL,
  tokens_in integer NOT NULL,
  tokens_out integer NOT NULL,
  cache_read integer NOT NULL DEFAULT 0,
  cost_micros bigint NOT NULL,
  langfuse_trace_id text,
  at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN ai_usage.job_id IS 'agent_jobs row of a durable AI job; FK added with that table.';
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_tier_check CHECK (tier IN ('haiku', 'sonnet', 'opus'));
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_counts_check
  CHECK (tokens_in >= 0 AND tokens_out >= 0 AND cache_read >= 0 AND cache_read <= tokens_in AND cost_micros >= 0);
CREATE INDEX ai_usage_user_at_idx ON ai_usage (user_id, at) WHERE user_id IS NOT NULL;
CREATE INDEX ai_usage_trip_at_idx ON ai_usage (trip_id, at) WHERE trip_id IS NOT NULL;
CREATE INDEX ai_usage_job_idx ON ai_usage (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX ai_usage_at_idx ON ai_usage (at);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_system ON ai_usage FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON ai_usage TO app_system;
GRANT UPDATE (user_id) ON ai_usage TO app_system;
