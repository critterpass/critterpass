/**
 * Loads a link's preview for the ticket and the code card, and keeps it on the invite session so
 * the pass page can prefill from it. `retry` asks again (after an offline answer, say).
 */
import type { LinkTarget } from '@cp/domain';
import { useCallback, useEffect, useState } from 'react';

import type { PreviewResult } from '@/lib/links/resolver-client';

import { useInviteServices } from './invite-services';
import { inviteSession } from './invite-session';
import { ticketModel, type TicketModel } from './ticket-model';

export function useInvitePreview(target: LinkTarget | null): {
  readonly model: TicketModel;
  readonly retry: () => void;
} {
  const services = useInviteServices();
  const [loaded, setLoaded] = useState<{ key: string; result: PreviewResult } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = target === null ? null : JSON.stringify(target);

  useEffect(() => {
    if (target === null) return undefined;
    let live = true;
    const loading = key ?? '';
    void services.preview(target).then((next) => {
      if (!live) return;
      if (next.status === 'found') inviteSession.setPreview(next.preview);
      setLoaded({ key: `${loading}#${attempt}`, result: next });
    });
    return () => {
      live = false;
    };
    // `key` is the target's identity; `attempt` re-runs on retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, services]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // A result for another link (or an earlier attempt) reads as still loading.
  const result = loaded?.key === `${key ?? ''}#${attempt}` ? loaded.result : null;
  return { model: ticketModel(target === null ? null : result), retry };
}
