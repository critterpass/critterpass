/**
 * What the plan check last found still to fix on the trip's plan, for the screens that send and
 * lock it: a plan with a known problem is never blocked, but it is not sent or locked without a
 * word either. Read from the synced check row; the check itself is the plan area's.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { plural, t } from '@lingui/core/macro';

import { useLiveRows } from './rows';

const FIXES_SQL = `SELECT fix_count FROM plan_checks WHERE trip_id = ?
  ORDER BY updated_at DESC LIMIT 1`;

/** Things the plan check says to fix; 0 when it found none or has not run. */
export function useFixesToMake(tripId: string | null): number {
  const { rows } = useLiveRows<{ fix_count: number | null }>(
    FIXES_SQL,
    tripId === null ? null : [tripId],
    ['plan_checks'],
  );
  return Math.max(0, Number(rows[0]?.fix_count ?? 0));
}

/** "The plan check still has 1 thing to fix." for the builder and the lock sheet. */
export function fixesLine(count: number, locking: boolean): string | null {
  if (count <= 0) return null;
  return locking
    ? t({
        id: 'proposal.issues.lock',
        message: plural(count, {
          one: 'The plan check still has # thing to fix. You can lock now and fix it after.',
          other: 'The plan check still has # things to fix. You can lock now and fix them after.',
        }),
      })
    : t({
        id: 'proposal.issues.send',
        message: plural(count, {
          one: 'The plan check still has # thing to fix. The crew will see the plan as it is.',
          other: 'The plan check still has # things to fix. The crew will see the plan as it is.',
        }),
      });
}
