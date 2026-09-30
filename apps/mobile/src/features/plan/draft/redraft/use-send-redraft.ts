/**
 * Sends a redraft for one day against the draft on screen and, once it is under way, replaces the
 * sheet with the redraft screen (its thinking beat, then the diff). Anything else comes back as an
 * outcome for the sheet to explain.
 */
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { requestRedraftCommand } from '../data/commands';
import { redraftOutcome, type RedraftOutcome } from '../data/redraft-request';
import { draftRoutes, type RedraftAsk } from '../routes';

export function useSendRedraft(tripId: string, baseVersion: string | null) {
  const request = useCommand(requestRedraftCommand);
  const [outcome, setOutcome] = useState<RedraftOutcome | null>(null);
  const send = async (ask: RedraftAsk) => {
    if (baseVersion === null) return;
    setOutcome(null);
    const note = ask.note.trim();
    const result = await request.send({
      trip_id: tripId,
      day: ask.day,
      reasons: [...ask.reasons],
      base_version: baseVersion,
      ...(note === '' ? {} : { note }),
      ...(ask.free ? { free_reason: 'late_must_do' as const } : {}),
    });
    const next = redraftOutcome(result);
    if (next.kind === 'started')
      router.replace(draftRoutes.redraft(tripId, next.redraftId, ask.day));
    else setOutcome(next);
  };
  return { send, outcome, pending: request.pending, clear: () => setOutcome(null) };
}
