/**
 * The swipe deck before it has cards (undesigned; built from the kit's loading critter, empty
 * state and button): while the guide builds it, the bobbing critter with "Building the deck" and
 * how long it takes, centred; once the deck is in but its places are still reaching the phone, the
 * same critter with "Almost there"; past the time a deck takes, the sleeping critter says it didn't
 * come together, with Start again as the one button under it.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Button, EmptyState, LoadingCritter, Text, usePremiumTheme } from '@/ui/premium';

import { DECK_MINUTES, type DeckWait } from '../../deck-wait';
import type { GuideFacts } from '../../format';

export function SwipeWaiting(props: {
  readonly wait: DeckWait;
  readonly guide: GuideFacts;
  readonly onRetry: (() => void) | undefined;
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const guideName = props.guide.name;
  if (props.wait === 'stuck') {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }} testID="swipe-stuck">
        <EmptyState
          title={t({ id: 'explore.premium.swipe.stuckTitle', message: 'The deck didn’t come' })}
          line={t({
            id: 'explore.premium.swipe.stuckLine',
            message: `${guideName} couldn’t finish this one. Start again for a fresh deck.`,
          })}
          check={false}
          action={
            props.onRetry === undefined ? undefined : (
              <Button
                label={t({ id: 'explore.premium.swipe.retry', message: 'Start again' })}
                onPress={props.onRetry}
                testID="swipe-retry"
              />
            )
          }
        />
      </View>
    );
  }
  const arriving = props.wait === 'arriving';
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.space.gap8,
        paddingHorizontal: theme.space.gutter,
      }}
      testID="swipe-building"
    >
      <LoadingCritter
        label={
          arriving
            ? t({ id: 'explore.premium.swipe.arriving', message: 'Almost there' })
            : t({ id: 'explore.premium.swipe.building', message: 'Building the deck' })
        }
      />
      <Text variant="caption" tone="muted" align="center" singleLine={false}>
        {arriving
          ? t({
              id: 'explore.premium.swipe.arrivingLine',
              message: 'The cards are on their way to your phone.',
            })
          : t({
              id: 'explore.premium.swipe.buildingLine',
              message: `${guideName} is picking places for the crew. It takes about ${DECK_MINUTES} minutes.`,
            })}
      </Text>
    </View>
  );
}
