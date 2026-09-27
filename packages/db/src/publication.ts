/**
 * PowerSync `powersync` publication allow-list (docs/data-model.md §1 Conventions, code-standards.md
 * §13): every registered table whose privacy class is C0-C2 enters the publication, except a table
 * whose RLS shape is "S" in data-model.md §1.1's own legend ("no app_user grant... read via API") —
 * a privacy class alone does not mean a client may `SELECT` the table directly.
 * `packages/db/migrations/*_ops_core_and_publication.sql` hand-copies this same list into the
 * publication's guarded `ADD TABLE` loop; `packages/db/test/publication.test.ts` and
 * `tools/scripts/check-publication.ts` both cross-check the two never drift.
 */
import { getTablePrivacy, isPublishableClass, listRegisteredTables } from '@cp/domain';

// Importing the schema barrel runs every schema module's registerTablePrivacy() call once, so
// listRegisteredTables() below always sees the full set regardless of import order elsewhere.
import * as schema from './schema';

/**
 * Tables whose privacy class alone (C0-C2) would qualify them, but whose RLS shape is "S"
 * (docs/data-model.md §1.1): `media_objects` (packages/db/src/schema/identity.ts) has no app_user
 * SELECT policy at all — reads happen only through the API — so a client can never see it directly
 * even though the row content itself is not sensitive. Add a new entry here, with the same comment
 * style, if a later table needs the same treatment.
 *
 * `poi_embeddings` (packages/db/src/schema/places.ts) is the same RLS "S" shape: server-only search
 * ranking, no app_user grant at all. `cities` and `poi_live_checks` are RLS "R" (app_user can read
 * them directly) but docs/data-model.md §3.13 marks both `Stream: —`/"not synced" rather than a
 * PowerSync stream name: `cities` is served over HTTP only (too large and too rarely-changing a
 * reference table for a live sync stream), and `poi_live_checks` is a volatile per-POI cache
 * refreshed by on-demand live checks, read through the places API rather than replicated.
 */
const PUBLISHABLE_CLASS_EXCEPTIONS: ReadonlySet<string> = new Set([
  'cities',
  'media_objects',
  'poi_embeddings',
  'poi_live_checks',
]);

/** Every table this schema declares that the `powersync` publication should carry. */
export function computePublicationAllowList(): readonly string[] {
  void schema; // ensure the side-effecting import above is never tree-shaken away.
  return listRegisteredTables().filter((table) => {
    const privacy = getTablePrivacy(table);
    return (
      privacy !== undefined &&
      isPublishableClass(privacy.class) &&
      !PUBLISHABLE_CLASS_EXCEPTIONS.has(table)
    );
  });
}
