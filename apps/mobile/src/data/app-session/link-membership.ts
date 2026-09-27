/**
 * The link router's local answers (lib/links/router.ts): whether this user is an active member of
 * a crew, and which of their crews an invite code belongs to. Members sync their crews'
 * `crew_members` and `join_codes`, so both come from the local database; the router asks
 * synchronously (`+native-intent` runs outside React), so the answers are kept in memory and
 * refreshed whenever either table changes.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: SQL only. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { configureLinkRouter } from '../../lib/links/router';

const MEMBER_CREWS_SQL =
  "SELECT crew_id FROM crew_members WHERE user_id = ? AND status = 'active' AND left_at IS NULL";
const MEMBER_CODES_SQL = "SELECT code, crew_id FROM join_codes WHERE status = 'active'";
const TABLES = ['crew_members', 'join_codes'];

/** Keeps the router's membership lookups current for `uid`; returns the function that stops. */
export function watchLinkMembership(
  db: AbstractPowerSyncDatabase,
  uid: string,
  onError: (error: unknown) => void,
): () => void {
  let crews = new Set<string>();
  let codes = new Map<string, string>();
  const controller = new AbortController();

  const load = async () => {
    const [memberRows, codeRows] = await Promise.all([
      db.getAll<{ crew_id: string }>(MEMBER_CREWS_SQL, [uid]),
      db.getAll<{ code: string; crew_id: string | null }>(MEMBER_CODES_SQL),
    ]);
    if (controller.signal.aborted) return;
    crews = new Set(memberRows.map((row) => row.crew_id));
    codes = new Map(
      codeRows.flatMap((row) =>
        row.crew_id !== null && crews.has(row.crew_id) ? [[row.code, row.crew_id] as const] : [],
      ),
    );
  };

  configureLinkRouter({
    isMember: (crewId) => crews.has(crewId),
    memberCrewForCode: (code) => codes.get(code) ?? null,
  });
  void load().catch(onError);
  db.onChange(
    { onChange: () => void load().catch(onError) },
    { tables: TABLES, throttleMs: 30, signal: controller.signal },
  );

  return () => {
    controller.abort();
    configureLinkRouter({ isMember: () => false, memberCrewForCode: () => null });
  };
}
