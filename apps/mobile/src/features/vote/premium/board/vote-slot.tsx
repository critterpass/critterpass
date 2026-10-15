/**
 * Home's vote slot: the crew's open destination poll under the trip cards, drawn as the pitch
 * board (3.02), or as the two-place final card once the board has moved on. Registered with Home
 * at load.
 */
import { registerHomeVoteSlot, type VoteSlotProps } from '@/features/home';

import { useHomeDestinationVote } from '../../data/use-board';
import { useMyUid } from '../../data/use-my-uid';
import { usePoll } from '../../data/use-poll';
import { boardShape } from './board-model';
import { DestinationBoard } from './destination-board';
import { FinalCard } from './final-card';

export function VoteSlot({ vote, guideNote }: VoteSlotProps) {
  const me = useMyUid();
  const { poll } = usePoll(vote.pollId, me);
  if (poll === null || me === null) return guideNote ?? null;
  if (boardShape(poll) === 'final') {
    return (
      <>
        <FinalCard poll={poll} />
        {guideNote}
      </>
    );
  }
  return <DestinationBoard poll={poll} me={me} guideNote={guideNote} />;
}

let registered = false;

export function registerDestinationVoteSlot(): void {
  if (registered) return;
  registered = true;
  registerHomeVoteSlot({ useVote: useHomeDestinationVote, Component: VoteSlot });
}
