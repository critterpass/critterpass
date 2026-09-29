/**
 * Home's vote slot: the crew's open destination poll under WHERE NEXT?, drawn as the pitch board,
 * or as the two-place final once the board has moved on. Registered with Home at load.
 */
import { registerHomeVoteSlot, type VoteSlotProps } from '@/features/home';

import { useHomeDestinationVote } from '../data/use-board';
import { useMyUid } from '../data/use-my-uid';
import { usePoll } from '../data/use-poll';
import { FinalSplitCard } from '../final/final-split-card';
import { DestinationBoard } from './destination-board';

export function VoteSlot({ vote }: VoteSlotProps) {
  const me = useMyUid();
  const { poll } = usePoll(vote.pollId, me);
  if (poll === null || me === null) return null;
  if (poll.stage === 'final') return <FinalSplitCard poll={poll} />;
  return <DestinationBoard poll={poll} me={me} />;
}

let registered = false;

export function registerDestinationVoteSlot(): void {
  if (registered) return;
  registered = true;
  registerHomeVoteSlot({ useVote: useHomeDestinationVote, Component: VoteSlot });
}
