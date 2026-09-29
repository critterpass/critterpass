/**
 * A closed poll's result: the winner and the score ("Tacos won 3–1"), then every answer with its
 * count and voters, the winner marked. Shown on the poll screen once the vote has closed.
 */
import { useLingui } from '@lingui/react/macro';

import { AvatarStack } from '@/ui/people/AvatarStack';
import { useTheme } from '@/ui/theme';
import { ResultTally } from '@/ui/vote/ResultTally';

import type { PollView } from '../data/poll-view';
import { stackOf, usePeople } from '../data/use-people';

/** "3–1": the winner's count, then the best of the rest. */
export function pollScore(poll: PollView): string {
  const winner = poll.options.find((option) => option.winner);
  const rest = Math.max(0, ...poll.options.filter((o) => !o.winner).map((o) => o.votes));
  return `${winner?.votes ?? 0}–${rest}`;
}

export function PollResult({ poll }: { readonly poll: PollView }) {
  const { t } = useLingui();
  const theme = useTheme();
  const people = usePeople(poll.crewId);
  const winner = poll.options.find((option) => option.winner);
  const score = pollScore(poll);
  const headline =
    winner === undefined
      ? t({ id: 'vote.result.none', message: 'Nobody voted' })
      : t({ id: 'vote.result.won', message: `${winner.label} won ${score}` });
  return (
    <ResultTally
      headline={headline}
      testID="poll-result"
      rows={poll.options.map((option) => ({
        id: option.id,
        name: option.label,
        votes: option.votes,
        winner: option.winner,
        color: option.winner ? theme.semantic.state.success : theme.color.ink['600'],
        voters: <AvatarStack members={stackOf(people, option.voterIds)} size="sm" max={4} />,
      }))}
    />
  );
}
