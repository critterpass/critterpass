-- Home and lock-screen widgets (docs/data-model.md §3.11): the widget extension's push token per
-- install, and the widgets a phone currently shows (kind, size family, the trip or crew it is set
-- to). Both are C2, owner-readable (class O), written only by app_system on the owner's behalf
-- (a token that moves to another install must detach from its previous owner), and never
-- replicated to a client: the phone is the source of truth and the worker reads them to push.

CREATE TABLE widget_push_tokens (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  device_id uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- `all`: iOS hands one token to the whole widget extension.
  widget_kind text NOT NULL DEFAULT 'all' CHECK (widget_kind IN (
    'all', 'countdown', 'vote', 'today', 'balances', 'crew', 'critterdex', 'next_flight',
    'next_leave_by', 'standby_clock'
  )),
  token text NOT NULL
    CHECK (token ~ '^[0-9a-f]+$' AND char_length(token) BETWEEN 16 AND 512),
  env text NOT NULL CHECK (env IN ('sandbox', 'prod')),
  invalid_at timestamptz,
  invalid_reason text CHECK (char_length(invalid_reason) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT widget_push_tokens_device_kind_key UNIQUE (device_id, widget_kind)
);
CREATE INDEX widget_push_tokens_user_idx ON widget_push_tokens (user_id);
CREATE TRIGGER widget_push_tokens_touch_updated_at BEFORE UPDATE ON widget_push_tokens
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE widget_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_push_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY widget_push_tokens_self ON widget_push_tokens FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY widget_push_tokens_system ON widget_push_tokens FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON widget_push_tokens TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON widget_push_tokens TO app_system;

CREATE TABLE installed_widgets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  device_id uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'countdown', 'vote', 'today', 'balances', 'crew', 'critterdex', 'next_flight',
    'next_leave_by', 'standby_clock'
  )),
  family text NOT NULL CHECK (family IN (
    'system_small', 'system_medium', 'system_large', 'accessory_inline', 'accessory_circular',
    'accessory_rectangular', 'android'
  )),
  -- `{trip_id?, crew_id?}`: ids only, never a place or an amount.
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX installed_widgets_device_idx ON installed_widgets (device_id);
CREATE INDEX installed_widgets_user_idx ON installed_widgets (user_id);
CREATE INDEX installed_widgets_seen_idx ON installed_widgets (last_seen_at);
CREATE TRIGGER installed_widgets_touch_updated_at BEFORE UPDATE ON installed_widgets
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE installed_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE installed_widgets FORCE ROW LEVEL SECURITY;
CREATE POLICY installed_widgets_self ON installed_widgets FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY installed_widgets_system ON installed_widgets FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON installed_widgets TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON installed_widgets TO app_system;

REVOKE ALL ON widget_push_tokens, installed_widgets FROM guide_reader, powersync_repl;

-- Per-device daily count of widget refresh pushes (the worker's cap), server-only.
CREATE TABLE widget_push_ledger (
  device_id uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  utc_date date NOT NULL,
  sent integer NOT NULL DEFAULT 0 CHECK (sent >= 0),
  last_routine_at timestamptz,
  PRIMARY KEY (device_id, utc_date)
);
ALTER TABLE widget_push_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_push_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY widget_push_ledger_system ON widget_push_ledger FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON widget_push_ledger TO app_system;
REVOKE ALL ON widget_push_ledger FROM guide_reader, powersync_repl;
