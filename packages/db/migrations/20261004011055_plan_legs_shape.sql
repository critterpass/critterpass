-- `plan_legs.shape`: the road a leg follows, as our self-hosted Valhalla routed it for the leg's
-- mode (OpenStreetMap, ODbL, so it may be stored and synced). An encoded polyline at precision 5,
-- simplified for display (at most about 200 points). Null for a straight-line estimate or a leg
-- the router could not draw; the phone then draws the leg straight. Privacy class stays C1: the
-- shape only joins places already in the plan. Additive: older app builds ignore the column.

ALTER TABLE plan_legs ADD COLUMN IF NOT EXISTS shape text;
