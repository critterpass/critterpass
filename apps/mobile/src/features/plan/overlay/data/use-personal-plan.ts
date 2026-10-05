/**
 * Keep or drop my own change where the crew's plan moved under it, through
 * `resolve_overlay_clash`, which queues offline like any other plan write.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import { msg } from '@lingui/core/macro';
import { useCallback, useContext } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { LocalFirstContext } from '@/data/powersync/local-first-context';

export const RESOLVE_OVERLAY_CLASH = defineClientCommand<{
  personal_ops_id: string;
  keep: boolean;
}>({
  name: 'resolve_overlay_clash',
  offline: true,
  summarize: (p) =>
    p.keep
      ? msg({ id: 'plan.overlay.queued.keep', message: 'Keep your own plan' })
      : msg({ id: 'plan.overlay.queued.drop', message: 'Go with the crew plan' }),
});

export function useResolveClash(): (personalOpsId: string, keep: boolean) => Promise<void> {
  const commands = useContext(LocalFirstContext)?.commands ?? null;
  return useCallback(
    async (personalOpsId, keep) => {
      await commands?.send(RESOLVE_OVERLAY_CLASH, { personal_ops_id: personalOpsId, keep });
    },
    [commands],
  );
}
