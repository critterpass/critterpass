/**
 * Feeds the planning switch (`lib/navigation/planning-switch`) from the synced public config: once
 * the local database is up it reads `planning.redesign` and `plan.hub` from `client_config`, and
 * again on every change to that table. Signing out forgets them. Started once by the planning
 * register.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { registerOnSignOut } from '@/data/auth/sign-out-hooks';
import { getLocalFirst } from '@/data/powersync/db';
import {
  applyPlanningSwitch,
  PLANNING_SWITCH_KEYS,
  readPlanningSwitch,
  resetPlanningSwitch,
} from '@/lib/navigation/planning-switch';

const SWITCH_SQL = `SELECT key, value FROM client_config WHERE key IN (${PLANNING_SWITCH_KEYS.map(
  () => '?',
).join(', ')})`;
/** How often to look for the database before it is up (sign-in, first launch). */
const WAIT_MS = 1500;

let started = false;

export function startPlanningSwitchFeed(): void {
  if (started) return;
  started = true;
  registerOnSignOut(() => resetPlanningSwitch());
  const attach = () => {
    const localFirst = getLocalFirst();
    if (localFirst === null) {
      setTimeout(attach, WAIT_MS);
      return;
    }
    const { db } = localFirst;
    const load = () =>
      db
        .getAll<{ key: string; value: string | null }>(SWITCH_SQL, [...PLANNING_SWITCH_KEYS])
        .then((rows) => {
          // An empty table (signed out, not synced yet) keeps the last values.
          if (rows.length > 0) applyPlanningSwitch(readPlanningSwitch(rows));
        })
        .catch(() => undefined);
    void load();
    db.onChange({ onChange: () => void load() }, { tables: ['client_config'], throttleMs: 200 });
  };
  attach();
}
