-- The perk lines the website's pricing section lists (docs/api-contracts.md §5.6
-- `GET /v1/catalog/perks`): the switched-on rows of the `perks` catalogue (class C0), read by the
-- api as `public_reader` like every other public web read. A perk switched off in the console
-- leaves the view, so it leaves the site as it leaves the app. No user data.
CREATE VIEW public.perks_public WITH (security_barrier = true) AS
SELECT p.key, p.tier, p.copy_key, p.sort
  FROM perks p
 WHERE p.is_shipped;

GRANT SELECT ON public.perks_public TO public_reader;
