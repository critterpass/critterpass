/**
 * The MVP vote (3m-5's VOTE FOR THE MVP, undesigned sheet): one row per award with the live tally,
 * one tap votes (a change is allowed until the vote closes), and once closed the sheet says who
 * won. Opted-out awards are not on it.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';

import { ListCard } from '@/ui/cards/ListCard';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';

export interface MvpChoice {
  readonly awardId: string;
  readonly name: string;
  readonly title: string;
  readonly votes: number;
  readonly mvp: boolean;
}

export interface MvpSheetProps {
  readonly choices: readonly MvpChoice[];
  readonly myVote: string | null;
  readonly closed: boolean;
  readonly onVote: (awardId: string) => void;
  readonly onClose: () => void;
}

export function MvpSheet({ choices, myVote, closed, onVote, onClose }: MvpSheetProps) {
  const { t } = useLingui();
  const title = t({ id: 'recap.mvp.title', message: 'Vote for the MVP' });
  return (
    <Sheet detents={['fit']} onDismiss={onClose} accessibilityLabel={title} testID="recap-mvp">
      <Stack gap="12" padding="16">
        <Text variant="h3" accessibilityRole="header">
          {title}
        </Text>
        <SecondaryText variant="body">
          {closed
            ? t({
                id: 'recap.mvp.closed',
                message: 'The vote is closed. The gold edge is the MVP.',
              })
            : t({
                id: 'recap.mvp.open',
                message: 'One tap. You can change it until everyone has voted.',
              })}
        </SecondaryText>
        {choices.map((choice) => {
          const votes = choice.votes;
          return (
            <ListCard
              key={choice.awardId}
              title={`${choice.name} · ${choice.title}`}
              subtitle={
                choice.mvp
                  ? t({
                      id: 'recap.mvp.winner',
                      message: plural(votes, { one: 'MVP · # vote', other: 'MVP · # votes' }),
                    })
                  : choice.awardId === myVote
                    ? t({
                        id: 'recap.mvp.yours',
                        message: plural(votes, {
                          one: 'Your vote · # vote',
                          other: 'Your vote · # votes',
                        }),
                      })
                    : t({
                        id: 'recap.mvp.votes',
                        message: plural(votes, { one: '# vote', other: '# votes' }),
                      })
              }
              {...(closed ? {} : { onPress: () => onVote(choice.awardId) })}
              testID={`recap-mvp-${choice.awardId}`}
            />
          );
        })}
      </Stack>
    </Sheet>
  );
}
