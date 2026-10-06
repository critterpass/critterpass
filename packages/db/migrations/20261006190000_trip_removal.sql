-- Removing a trip that never got going: an organiser's `delete_trip` takes a setup trip nobody
-- else is on out of the database, with every row that hangs off it (setup answers, ideas, a
-- cancelled draft's versions, its own participant row). The rows that reference a trip span many
-- tables and grow with every feature, so the delete walks the foreign keys instead of naming them.

-- Deletes the rows of `target` whose `key_col` is one of `keys`, first deleting (depth first) every
-- row that references them through a single-column foreign key. A reference back into a table
-- already on the walk's path (a trip's `current_version_id`, a self-reference) is cleared instead,
-- which breaks the cycle. It runs as its owner (the migration role, a member of app_system, whose
-- policies it meets), so app_system needs no DELETE grant on every table a trip reaches; only
-- app_system may call it, and the command decides which trip. Guards still fire: an append-only
-- table (the money ledger) refuses, and the whole removal rolls back with it.
CREATE OR REPLACE FUNCTION app.purge_rows(target regclass, key_col name, keys text[], path regclass[] DEFAULT '{}')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  key_type text;
  fk record;
  refs text[];
BEGIN
  IF keys IS NULL OR cardinality(keys) = 0 THEN
    RETURN;
  END IF;
  SELECT format_type(a.atttypid, a.atttypmod) INTO key_type
    FROM pg_attribute a WHERE a.attrelid = target AND a.attname = key_col;
  FOR fk IN
    SELECT c.conrelid::regclass AS child, ca.attname AS child_col, pa.attname AS parent_col,
           format_type(pa.atttypid, pa.atttypmod) AS parent_type
      FROM pg_constraint c
      JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = c.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
     WHERE c.contype = 'f' AND c.confrelid = target AND cardinality(c.conkey) = 1
     ORDER BY c.conrelid::regclass::text, c.conname
  LOOP
    EXECUTE format('SELECT array_agg(%I::text) FROM %s WHERE %I = ANY($1::%s[]) AND %I IS NOT NULL',
                   fk.parent_col, target, key_col, key_type, fk.parent_col)
      INTO refs USING keys;
    CONTINUE WHEN refs IS NULL;
    IF fk.child = target OR fk.child = ANY(path) THEN
      EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = ANY($1::%s[])',
                     fk.child, fk.child_col, fk.child_col, fk.parent_type)
        USING refs;
    ELSE
      PERFORM app.purge_rows(fk.child, fk.child_col, refs, path || target);
    END IF;
  END LOOP;
  EXECUTE format('DELETE FROM %s WHERE %I = ANY($1::%s[])', target, key_col, key_type) USING keys;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.purge_rows(regclass, name, text[], regclass[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_rows(regclass, name, text[], regclass[]) TO app_system;
