/**
 * The invite sheet's resend: the caller's own in-app invites to this crew that nobody has answered
 * yet, and sending them again through `send_nudge` (reason `invite_open`). A tap sends now (the
 * server still waits out the invitee's quiet hours); a long press waits for their usual hour.
 * Invitees are never named on the sheet, so the answer is one line for all of them.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and outcome kinds, never copy. */
import { useCallback, useContext, useMemo, useState } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useQuietLiveRows as useLiveRows } from '@/data/powersync/live-rows';
import { nudgeOutcome, sendNudgeCommand, shareRelay, type NudgeOutcome } from '@/features/home';

import { summariseResend, type ResendSummary, type ResendWhen } from './resend-summary';

const UNANSWERED_SQL = `SELECT invitee_user_id AS uid FROM invites
  WHERE crew_id = ? AND inviter_id = ? AND status = 'pending' AND invitee_user_id IS NOT NULL
  ORDER BY created_at`;

export function useResendInvites(crewId: string, uid: string | null) {
  const commands = useContext(LocalFirstContext)?.commands ?? null;
  const rows = useLiveRows<{ uid: string }>(UNANSWERED_SQL, uid === null ? null : [crewId, uid], [
    'invites',
  ]);
  const [sending, setSending] = useState(false);
  const waiting = useMemo(() => rows.rows.map((row) => row.uid), [rows.rows]);

  const resend = useCallback(
    async (when: ResendWhen): Promise<ResendSummary> => {
      if (commands === null || waiting.length === 0) return { kind: 'failed' };
      setSending(true);
      try {
        const outcomes: NudgeOutcome[] = [];
        let relayed = false;
        for (const target of waiting) {
          const result = await commands.send(sendNudgeCommand, {
            target_uid: target,
            reason: 'invite_open',
            when,
          });
          const outcome = nudgeOutcome(result);
          if (outcome.kind === 'relay' && !relayed) {
            relayed = true;
            await shareRelay({ text: outcome.text, url: outcome.url });
          }
          outcomes.push(outcome);
        }
        return summariseResend(outcomes, new Date());
      } finally {
        setSending(false);
      }
    },
    [commands, waiting],
  );

  return { count: waiting.length, sending, resend };
}
