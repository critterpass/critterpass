-- agent_jobs (docs/data-model.md §3.3) and persona_packs (§3.13).
--
-- agent_jobs: one row per durable AI job (draft, redraft, recap, ...). Written only by app_system
-- (the API enqueues through a system transaction, the worker advances it); read by the job's own
-- user (stream `me`) and by the trip's organisers (stream `trip_draft`). C2, published.
--
-- persona_packs: versioned guide persona content (style, lexicon, voice settings). RLS class S: no
-- app_user grant; the guide reads approved packs only through llm.persona_packs. C0, never published.

CREATE TABLE agent_jobs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid REFERENCES trips (id),
  user_id uuid REFERENCES users (id),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  partial jsonb,
  input_hash text,
  base_version_id uuid REFERENCES itinerary_versions (id),
  result_ref jsonb,
  model text,
  tokens_in bigint NOT NULL DEFAULT 0,
  tokens_out bigint NOT NULL DEFAULT 0,
  cost_micros bigint NOT NULL DEFAULT 0,
  pgboss_job_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agent_jobs ADD CONSTRAINT agent_jobs_kind_check CHECK (kind IN ('draft', 'redraft', 'merge', 'proposal', 'disruption', 'recap', 'quests', 'pitch', 'briefing', 'content'));
ALTER TABLE agent_jobs ADD CONSTRAINT agent_jobs_status_check CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'));
ALTER TABLE agent_jobs ADD CONSTRAINT agent_jobs_steps_is_array_check CHECK (jsonb_typeof(steps) = 'array');
ALTER TABLE agent_jobs ADD CONSTRAINT agent_jobs_totals_check CHECK (tokens_in >= 0 AND tokens_out >= 0 AND cost_micros >= 0);
CREATE INDEX agent_jobs_trip_kind_status_idx ON agent_jobs (trip_id, kind, status);
CREATE INDEX agent_jobs_user_idx ON agent_jobs (user_id) WHERE user_id IS NOT NULL;
CREATE TRIGGER agent_jobs_touch_updated_at BEFORE UPDATE ON agent_jobs
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY agent_jobs_select ON agent_jobs FOR SELECT TO app_user
  USING (user_id = app.uid() OR (trip_id IS NOT NULL AND app.is_trip_organiser(trip_id)));
CREATE POLICY agent_jobs_system ON agent_jobs FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON agent_jobs TO app_user;
GRANT SELECT, INSERT, UPDATE ON agent_jobs TO app_system;

-- The per-call cost rows of a job; a purged job keeps its usage rows (cost records outlive jobs).
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES agent_jobs (id) ON DELETE SET NULL;
COMMENT ON COLUMN ai_usage.job_id IS 'agent_jobs row of a durable AI job; nulled when the job row is purged.';

CREATE TABLE persona_packs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  guide_id uuid NOT NULL REFERENCES guides (id),
  version text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  system_prompt_ref text,
  style jsonb NOT NULL DEFAULT '{}'::jsonb,
  lexicon jsonb NOT NULL DEFAULT '{}'::jsonb,
  voice_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT persona_packs_guide_version_key UNIQUE (guide_id, version)
);
ALTER TABLE persona_packs ADD CONSTRAINT persona_packs_status_check CHECK (status IN ('draft', 'approved'));
ALTER TABLE persona_packs ADD CONSTRAINT persona_packs_approved_at_check
  CHECK ((status = 'approved') = (approved_at IS NOT NULL));
CREATE TRIGGER persona_packs_touch_updated_at BEFORE UPDATE ON persona_packs
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE persona_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_packs FORCE ROW LEVEL SECURITY;

CREATE POLICY persona_packs_system ON persona_packs FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON persona_packs TO app_system;

-- PowerSync publication (docs/code-standards.md §13): agent_jobs only; persona_packs is excluded
-- (packages/db/src/publication.ts#PUBLISHABLE_CLASS_EXCEPTIONS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'agent_jobs'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE agent_jobs;
  END IF;
END
$$;
GRANT SELECT ON agent_jobs TO powersync_repl;
