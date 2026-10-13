/**
 * The end of the swipe deck (4.42): "That's the deck" (or "This session is over"), every match in a
 * list that scrolls however many there are, and "See them in Ideas" once there is one. No matches
 * says so in a line instead of leaving the card bare (undesigned, built from the card and type).
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';

import { Button, Card, Text, usePremiumTheme } from '@/ui/premium';

import type { DeckSummaryProps } from '../../swipe-view-props';

const HEART = '♥';

export function SwipeSummary({
  ended,
  matches,
  onIdeas,
}: {
  readonly ended: boolean;
  readonly matches: DeckSummaryProps['matches'];
  readonly onIdeas?: () => void;
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  return (
    <Card padded style={{ marginTop: theme.space.gap16, flexShrink: 1 }} testID="swipe-summary">
      <Text variant="title">
        {ended
          ? t({ id: 'explore.swipe.endedTitle', message: 'This session is over' })
          : t({ id: 'explore.swipe.doneTitle', message: "That's the deck" })}
      </Text>
      {matches.length === 0 ? (
        <Text variant="body" tone="muted" testID="swipe-summary-none">
          {t({
            id: 'explore.premium.swipe.noMatches',
            message: 'No matches this time.',
          })}
        </Text>
      ) : (
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: theme.space.gap6 }}>
          {matches.map((entry) => (
            <Text key={entry.id} variant="rowText">
              {`${HEART} ${entry.name}`}
            </Text>
          ))}
        </ScrollView>
      )}
      {onIdeas === undefined || matches.length === 0 ? null : (
        <Button
          label={t({ id: 'explore.swipe.seeIdeas', message: 'See them in Ideas' })}
          onPress={onIdeas}
          testID="swipe-see-ideas"
        />
      )}
    </Card>
  );
}
