/**
 * The end of a deck (or of a session someone ended): how many cards got a yes, the matches so far
 * (in Ideas with who said yes, or, for earlier matches, the day each is suggested for), the way to
 * Ideas when any match went there, and the way back.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { ListCard } from '@/ui/cards/ListCard';
import { GuideLine } from '@/ui/people/GuideLine';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { MatchOutcome } from '../trip-explore/swipe-outcome';

export interface DeckSummaryProps {
  /** The session was ended before this phone finished the deck. */
  readonly ended: boolean;
  readonly yesCount: number;
  readonly matches: readonly {
    readonly id: string;
    readonly name: string;
    readonly dayNo: number | null;
    /** Where the match went; absent reads `dayNo`. */
    readonly outcome?: MatchOutcome | undefined;
    /** Who said yes, already worded ("Alex, Rin and you"). */
    readonly voters?: string | undefined;
  }[];
  readonly guideName: string;
  /** Opens the trip's Ideas; shown when a match went there. */
  readonly onIdeas?: (() => void) | undefined;
  readonly onDone: () => void;
}

export function DeckSummary({
  ended,
  yesCount,
  matches,
  guideName,
  onIdeas,
  onDone,
}: DeckSummaryProps) {
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
            const kind = match.outcome?.kind ?? (day === null ? 'match' : 'suggested');
            const voters = match.voters ?? '';
            return (
              <ListCard
                key={match.id}
                title={match.name}
                subtitle={
                  kind === 'idea'
                    ? voters === ''
                      ? t({ id: 'explore.swipe.matchRowIdea', message: 'Match · in Ideas' })
                      : t({
                          id: 'explore.swipe.matchRowIdeaVoters',
                          message: `In Ideas · ${voters} said yes`,
                        })
                    : day === null
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
          {onIdeas === undefined ||
          !matches.some((match) => match.outcome?.kind === 'idea') ? null : (
            <TextLink
              label={t({ id: 'explore.swipe.seeIdeas', message: 'See them in Ideas' })}
              onPress={onIdeas}
              testID="explore-swipe-see-ideas"
            />
          )}
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
