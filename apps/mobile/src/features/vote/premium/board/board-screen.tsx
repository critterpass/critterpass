/**
 * The pitch board as its own page, for the trip hub's "Voting": the same board Home draws, under
 * "Where next?". Once the board moves on to its final the page becomes the showdown, and a closed
 * vote opens its reveal.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView } from 'react-native';

import { makePremiumStyles } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useMyUid } from '../../data/use-my-uid';
import { usePoll } from '../../data/use-poll';
import type { PollView } from '../../data/poll-view';
import { voteRoutes } from '../../routes';
import { PremiumLoadingPage, PremiumMissingPage } from '../components/screen-states';
import { boardShape } from './board-model';
import { DestinationBoard } from './destination-board';

const useStyles = makePremiumStyles((t) => ({
  content: {
    paddingHorizontal: t.space.gutter,
    paddingTop: t.space.gutter,
    paddingBottom: t.space.tabBarClearance,
  },
}));

function BoardPage({ poll, me }: { readonly poll: PollView; readonly me: string }) {
  const styles = useStyles();
  const { t } = useLingui();
  const shape = boardShape(poll);
  useEffect(() => {
    if (poll.status === 'closed') router.replace(voteRoutes.reveal(poll.id));
    else if (shape === 'final') router.replace(voteRoutes.showdown(poll.id));
  }, [poll.status, poll.id, shape]);
  return (
    <PushScreen
      title={t({ id: 'vote.premium.board.title', message: 'Where next?' })}
      backLabel={t({ id: 'vote.premium.back', message: 'Back' })}
      scroll={false}
      testID="vote-board"
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <DestinationBoard poll={poll} me={me} heading={false} />
      </ScrollView>
    </PushScreen>
  );
}

export function PremiumBoardScreen({ pollId }: { readonly pollId: string }) {
  const { t } = useLingui();
  const me = useMyUid();
  const { poll, loaded } = usePoll(pollId, me);
  const title = t({ id: 'vote.premium.board.title', message: 'Where next?' });
  if (poll !== null && me !== null) return <BoardPage poll={poll} me={me} />;
  if (!loaded || me === null) {
    return (
      <PremiumLoadingPage
        title={title}
        label={t({ id: 'vote.showdown.loading', message: 'Loading the vote' })}
        testID="vote-board-loading"
      />
    );
  }
  return (
    <PremiumMissingPage
      title={title}
      headline={t({ id: 'vote.showdown.missingTitle', message: 'This vote isn’t here' })}
      line={t({
        id: 'vote.showdown.missingLine',
        message: 'It may be over, or this phone hasn’t got it yet.',
      })}
      testID="vote-board-missing"
    />
  );
}
