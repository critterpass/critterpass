-- A crew pass's cover colour (docs/data-model.md §3.2 `crews`): one of the six free covers or a
-- referral cover the person who picked it had unlocked (`create_crew` / `update_crew` check that).
-- NULL draws the default cover. Same class as the crew row (C1); members may change it, as they may
-- rename the crew.
ALTER TABLE crews ADD COLUMN cover text
  CHECK (cover IN ('tangerine', 'sky', 'mint', 'pink', 'sun', 'ink', 'navy', 'collector'));
GRANT UPDATE (cover) ON crews TO app_user;
GRANT SELECT (cover) ON crews TO admin_reader;
