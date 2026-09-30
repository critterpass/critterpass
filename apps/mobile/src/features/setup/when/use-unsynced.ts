/**
 * Who has not shared a single day yet, from the windows route (online only; the crew's synced
 * rows carry counts, not names). Re-read when a calendar lands or the options move; offline the
 * dates step keeps the count wording.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a route path and hint types, never copy. */
import { useCallback, useEffect, useState } from 'react';

import { SETUP_RT } from '@cp/domain';

import { bodyOf, type SetupServices } from '../data/services';
import { useSetupHints } from '../data/use-setup-channel';

function idsOf(body: unknown): string[] | null {
  const ids = (body as { unsynced_member_ids?: unknown } | null)?.unsynced_member_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : null;
}

export function useUnsyncedMembers(tripId: string, services: SetupServices): readonly string[] {
  const [ids, setIds] = useState<readonly string[]>([]);
  const load = useCallback(() => {
    void services.getJson(`/v1/setup/${tripId}/windows`).then((read) => {
      const next = bodyOf(read, idsOf);
      if (next !== null) setIds(next);
    });
  }, [services, tripId]);
  useEffect(load, [load]);
  useSetupHints(tripId, (hint) => {
    if (hint === null || hint.type === SETUP_RT.syncCount || hint.type === SETUP_RT.windows) load();
  });
  return ids;
}
