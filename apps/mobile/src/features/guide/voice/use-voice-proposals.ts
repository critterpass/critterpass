/**
 * The changes the guide offered in a voice turn, as the screen's swap cards, and sending them to
 * the crew: each open change set goes out as a vote in crew chat, the way the guide sheet's plan
 * card proposes one. Titles, times and prices come from the change set and the plan, never from
 * the guide's words. The screen shows at most three change sets; the rest stay in the guide chat.
 */
import { useLingui } from '@lingui/react/macro';
import { useMemo, useState } from 'react';

import { useChangeset, useChangesetActions } from '@/features/plan';

import { costLine } from '../chat/components/plan-card';
import { toPlanCard, type PlanCardModel } from '../chat/data/use-plan-card';
import { groupStatus, voiceSwaps, type VoiceProposals } from './voice-swaps';

export function useVoiceProposals(
  tripId: string | null,
  proposals: readonly string[],
  shared: boolean,
): VoiceProposals {
  const { i18n } = useLingui();
  const [a = null, b = null, c = null] = proposals;
  const views = [useChangeset(tripId, a), useChangeset(tripId, b), useChangeset(tripId, c)];
  const actions = [useChangesetActions(a), useChangesetActions(b), useChangesetActions(c)];
  const [busy, setBusy] = useState(false);
  const [first, second, third] = views;
  const locale = i18n.locale;
  return useMemo(() => {
    const ids = [a, b, c];
    const slots = [first, second, third].map((view, index) => {
      const id = ids[index] ?? null;
      return id === null || view === undefined ? null : toPlanCard(id, view);
    });
    const models = slots.filter((model): model is PlanCardModel => model !== null);
    const status = shared ? groupStatus(models) : null;
    return {
      ...voiceSwaps(models, (model) => costLine(model, locale)),
      group:
        status === null
          ? null
          : {
              status,
              busy,
              onSend: () => {
                setBusy(true);
                const sends = slots.map((model, index) =>
                  model?.state === 'draft' ? actions[index]?.send() : undefined,
                );
                void Promise.allSettled(sends.map((sent) => Promise.resolve(sent))).finally(() =>
                  setBusy(false),
                );
              },
            },
    };
    // The action sets are memoised on the same ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, c, first, second, third, shared, busy, locale]);
}
