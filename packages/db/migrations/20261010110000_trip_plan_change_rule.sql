-- Who may change the crew's plan, set per trip in its settings (docs/api-contracts-planning.md,
-- `set_plan_change_rule`). `organiser_approves` keeps the rule every trip had until now: members
-- propose change sets and organisers apply them. `anyone` lets a member's edit go straight in;
-- `organiser_only` keeps the crew's plan to organisers (members keep their personal tweaks).
-- Organisers write it through the trips update policy; every crew member reads it with the trip.
ALTER TABLE trips ADD COLUMN plan_change_rule text NOT NULL DEFAULT 'organiser_approves'
  CHECK (plan_change_rule IN ('organiser_approves', 'anyone', 'organiser_only'));
GRANT SELECT (plan_change_rule) ON trips TO admin_reader;
