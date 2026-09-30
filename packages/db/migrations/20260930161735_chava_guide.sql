-- Chà Vá, the red-shanked douc langur of Đà Nẵng, joins the live guides with the new red guide
-- colour. The guide row is catalogue data every environment needs before a Đà Nẵng trip can point
-- at it, so it ships here rather than only in the dev seed. The table forces RLS; lifting FORCE for
-- the owner inside this one transaction lets the migrating owner write it without a policy.
ALTER TABLE guides DROP CONSTRAINT guides_colour_check;
ALTER TABLE guides ADD CONSTRAINT guides_colour_check
  CHECK (colour IN ('yellow', 'orange', 'blue', 'pink', 'green', 'cream', 'red'));

ALTER TABLE guides NO FORCE ROW LEVEL SECURITY;
INSERT INTO guides (slug, name, colour) VALUES ('chava', 'Chà Vá', 'red') ON CONFLICT (slug) DO NOTHING;
ALTER TABLE guides FORCE ROW LEVEL SECURITY;
