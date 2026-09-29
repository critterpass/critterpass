/**
 * Casting from any in-app surface: queues `cast_ballot` (the queued command is what the poll draws
 * at once, so the vote shows offline and counts once it syncs), with the vote haptic. Casting the
 * option already chosen does nothing.
 */
import { useCallback } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { impact } from '@/motion';

import type { PollView } from './poll-view';
import { castBallotCommand } from './vote-commands';

export function useCastBallot(poll: PollView | null) {
  const { send, pending } = useCommand(castBallotCommand);
  const cast = useCallback(
    async (optionId: string): Promise<boolean> => {
      if (poll === null || !poll.canVote) return false;
      if (poll.myOptionId === optionId) return false;
      if (poll.myOptionId !== null && !poll.allowChange) return false;
      impact('vote');
      const result = await send({ poll_id: poll.id, option_id: optionId });
      return result.kind !== 'rejected';
    },
    [poll, send],
  );
  return { cast, pending };
}
