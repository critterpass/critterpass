/**
 * The end of a deck (or of a session someone ended): how many cards got a yes, the matches so far
 * with the day each is suggested for, and the way back to the plan.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { ListCard } from '@/ui/cards/ListCard';
import { GuideLine } from '@/ui/people/GuideLine';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export interface DeckSummaryProps {
  /** The session was ended before this phone finished the deck. */
  readonly ended: boolean;
  readonly yesCount: number;
  readonly matches: readonly {
    readonly id: string;
    readonly name: string;
    readonly dayNo: number | null;
  }[];
  readonly guideName: string;
  readonly onDone: () => void;
}

export function DeckSummary({ ended, yesCount, matches, guideName, onDone }: DeckSummaryProps) {
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <View
      style={{ flex: 1, gap: theme.space['16'], justifyContent: 'center' }}
      testID="explore-swipe-summary"
    >
      <Text variant="h2">
        {ended
          ? t({ id: 'explore.swipe.endedTitle', message: 'This session is over' })
          : t({ id: 'explore.swipe.doneTitle', message: "That's the deck" })}
      </Text>
      <Text variant="body">
        {t({
          id: 'explore.swipe.doneCount',
          message: plural(yesCount, {
            one: 'You said yes to # place.',
            other: 'You said yes to # places.',
          }),
        })}
      </Text>
      {matches.length === 0 ? (
        <GuideLine
          guide="tokek"
          name={guideName}
          line={t({
            id: 'explore.swipe.noMatches',
            message: 'No matches yet. They land here as the rest of the crew swipes.',
          })}
        />
      ) : (
        <View style={{ gap: theme.space['8'] }}>
          {matches.map((match) => {
            const day = match.dayNo;
            return (
              <ListCard
                key={match.id}
                title={match.name}
                subtitle={
                  day === null
                    ? t({
                        id: 'explore.swipe.matchRowUnslotted',
                        message: 'Match · no free slot yet',
                      })
                    : t({
                        id: 'explore.swipe.matchRow',
                        message: `Match · suggested for Day ${day}`,
                      })
                }
              />
            );
          })}
        </View>
      )}
      <PillButton
        label={t({ id: 'explore.swipe.backToPlan', message: 'Back to the plan' })}
        onPress={onDone}
        testID="explore-swipe-done"
      />
    </View>
  );
}
