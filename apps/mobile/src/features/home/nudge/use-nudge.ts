/**
 * `useNudge`: the one way a screen nudges a crewmate (the inbox's NUDGE button, Who's in, the
 * briefing, the widget's app-side fallback). It sends `send_nudge` online so the sender learns at
 * once what happened, and answers with a typed outcome:
 * - `scheduled`: the guide nudges them at their usual hour (toast names the time);
 * - `inbox`: they have the app but no push, so it waits in their inbox;
 * - `relay`: they never installed the app, so the share sheet opens with the guide's line and the
 *   invite link (we never message them ourselves);
 * - `too_soon`: the pair nudged within 24 hours (`next_at`);
 * - `failed`: offline or refused for another reason.
 * From the inbox, the answer goes through `act_inbox_item` so the card settles in the same op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- outcome kinds, command names and wire codes; every
   word a user reads goes through t. */
import { useLingui } from '@lingui/react/macro';
import { useCallback, useState } from 'react';

import { NUDGE_PAIR_COOLDOWN_MS, type SendNudgePayload, type SendNudgeResult } from '@cp/domain';

import type { SendResult } from '@/data/commands/client';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { defineClientCommand } from '@/data/commands/summaries';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { sendNudgeCommand } from '../home-commands';
import { parseInstant } from '../inbox/inbox-data';
import { showNudgeToast } from './nudge-toast';
import { shareRelay } from './share-relay';

export type NudgeOutcome =
  | {
      readonly kind: 'scheduled';
      readonly at: string;
      readonly guide: string;
      readonly name: string;
    }
  | { readonly kind: 'inbox'; readonly guide: string; readonly name: string }
  | { readonly kind: 'relay'; readonly text: string; readonly url: string | null }
  | { readonly kind: 'too_soon'; readonly nextAt: Date }
  | { readonly kind: 'failed'; readonly code: string };

/** `act_inbox_item` sent online, for a NUDGE answer whose result the sender must see. */
export const actInboxItemOnline = defineClientCommand<{ item_id: string; action: string }>({
  name: 'act_inbox_item',
  offline: false,
});

const TOO_SOON = 'NUDGE_TOO_SOON';

function isNudgeResult(value: unknown): value is SendNudgeResult {
  return (
    value !== null &&
    typeof value === 'object' &&
    'outcome' in value &&
    (value.outcome === 'scheduled' || value.outcome === 'inbox' || value.outcome === 'relay')
  );
}

/**
 * Maps a command answer to the outcome the caller sees. The cooldown (429) arrives without its
 * detail through the online door, so `lastSentAt` (the pair's last nudge, from synced rows) gives
 * the next time the pair may nudge.
 */
export function nudgeOutcome(result: SendResult, lastSentAt: Date | null = null): NudgeOutcome {
  if (result.kind === 'rejected' || result.kind === 'unavailable') {
    if (result.code === TOO_SOON) {
      const detail = result.kind === 'rejected' ? (result.detail as { next_at?: unknown }) : null;
      const nextAt =
        typeof detail?.next_at === 'string'
          ? new Date(detail.next_at)
          : new Date((lastSentAt ?? new Date()).getTime() + NUDGE_PAIR_COOLDOWN_MS);
      return { kind: 'too_soon', nextAt };
    }
    return { kind: 'failed', code: result.code };
  }
  if (result.kind !== 'applied') return { kind: 'failed', code: result.kind };
  const nested = (result.result as { result?: unknown } | null)?.result;
  const answer = isNudgeResult(result.result) ? result.result : nested;
  if (!isNudgeResult(answer)) return { kind: 'failed', code: 'UNEXPECTED' };
  if (answer.outcome === 'scheduled') {
    return {
      kind: 'scheduled',
      at: answer.send_at_local,
      guide: answer.guide.name,
      name: answer.target_name,
    };
  }
  if (answer.outcome === 'inbox') {
    return { kind: 'inbox', guide: answer.guide.name, name: answer.target_name };
  }
  return { kind: 'relay', text: answer.text, url: answer.url };
}

export function useNudge() {
  const { commands, db } = useLocalFirst();
  const { i18n, t } = useLingui();
  const [pending, setPending] = useState(false);

  const lastSent = useCallback(
    async (target: string | null): Promise<Date | null> => {
      if (target === null) return null;
      const row = await db.getOptional<{ at: string | null }>(
        `SELECT max(n.created_at) AS at FROM nudges n
          WHERE n.target_id = ? AND n.sender_id = (SELECT value FROM local_state WHERE id = ?)`,
        [target, OWNER_UID_KEY],
      );
      return row?.at == null ? null : parseInstant(row.at);
    },
    [db],
  );

  const finish = useCallback(
    async (result: SendResult, target: string | null): Promise<NudgeOutcome> => {
      const outcome = nudgeOutcome(result, await lastSent(target));
      if (outcome.kind === 'relay') {
        const url = outcome.url;
        const line =
          url === null
            ? t({
                id: 'home.nudge.relay',
                message: 'Your crew is saving you a spot on CritterPass.',
              })
            : t({
                id: 'home.nudge.relayLink',
                message: `Your crew is saving you a spot on CritterPass. ${url}`,
              });
        await shareRelay({ text: line, url });
      } else {
        showNudgeToast(i18n, outcome, result.opId);
      }
      return outcome;
    },
    [i18n, t, lastSent],
  );

  const run = useCallback(
    async (send: () => Promise<SendResult>, target: string | null): Promise<NudgeOutcome> => {
      setPending(true);
      try {
        return await finish(await send(), target);
      } finally {
        setPending(false);
      }
    },
    [finish],
  );

  const nudge = useCallback(
    (payload: SendNudgePayload) =>
      run(() => commands.send(sendNudgeCommand, payload), payload.target_uid),
    [commands, run],
  );

  const nudgeFromInbox = useCallback(
    (itemId: string, action: string) =>
      run(() => commands.send(actInboxItemOnline, { item_id: itemId, action }), null),
    [commands, run],
  );

  return { nudge, nudgeFromInbox, pending };
}
