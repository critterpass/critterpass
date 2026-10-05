/**
 * Feeds the plan hub setting (`lib/navigation/plan-hub-setting`) from the synced public config:
 * once the local database is up it reads `plan.hub` from `client_config`, and again on every change
 * to that table. Signing out forgets it. Started once by the planning register.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { registerOnSignOut } from '@/data/auth/sign-out-hooks';
import { getLocalFirst } from '@/data/powersync/db';
import {
  applyPlanHub,
  PLAN_HUB_KEY,
  readPlanHub,
  resetPlanHub,
} from '@/lib/navigation/plan-hub-setting';

const HUB_SQL = 'SELECT key, value FROM client_config WHERE key = ?';
/** How often to look for the database before it is up (sign-in, first launch). */
const WAIT_MS = 1500;

let started = false;

export function startPlanHubFeed(): void {
  if (started) return;
  started = true;
  registerOnSignOut(() => resetPlanHub());
  const attach = () => {
    const localFirst = getLocalFirst();
    if (localFirst === null) {
      setTimeout(attach, WAIT_MS);
      return;
    }
    const { db } = localFirst;
    const load = () =>
      db
        .getAll<{ key: string; value: string | null }>(HUB_SQL, [PLAN_HUB_KEY])
        .then((rows) => {
          // An empty answer (signed out, not synced yet) keeps the last value.
          if (rows.length > 0) applyPlanHub(readPlanHub(rows));
        })
        .catch(() => undefined);
    void load();
    db.onChange({ onChange: () => void load() }, { tables: ['client_config'], throttleMs: 200 });
  };
  attach();
}
