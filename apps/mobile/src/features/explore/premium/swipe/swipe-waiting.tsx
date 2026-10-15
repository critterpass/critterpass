/**
 * The swipe deck before it has cards (undesigned; built from the kit's skeleton, loading critter,
 * guide note, empty state and button): while the guide builds it, the deck's own card as the kit's
 * card-face skeleton, the bobbing critter with "Building the deck" under it, and the guide's line
 * saying how long it takes; once the deck is in but its places
 * are still reaching the phone, the same card with "Almost there"; past the time a deck takes, the
 * sleeping critter says it didn't come together, with Start again as the one button under it.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  EmptyState,
  GuideNote,
  LoadingCritter,
  SkeletonCardFace,
  usePremiumTheme,
} from '@/ui/premium';

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
    <View style={{ flex: 1, gap: theme.space.gap16 }} testID="swipe-building">
      <View
        style={{
          flex: 1,
          borderRadius: 36,
          backgroundColor: theme.color.card,
          padding: 8,
          boxShadow: theme.shadow.card,
          // In the dark look the card is near the page's colour: its ring keeps the deck's shape.
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.color.hairline,
        }}
      >
        <View style={{ flex: 1, borderRadius: 29, overflow: 'hidden' }}>
          <SkeletonCardFace />
        </View>
      </View>
      <LoadingCritter
        label={
          arriving
            ? t({ id: 'explore.premium.swipe.arriving', message: 'Almost there' })
            : t({ id: 'explore.premium.swipe.building', message: 'Building the deck' })
        }
      />
      <GuideNote
        name={guideName}
        critter={props.guide.kind}
        text={
          arriving
            ? t({
                id: 'explore.premium.swipe.arrivingLine',
                message: 'The cards are on their way to your phone.',
              })
            : t({
                id: 'explore.premium.swipe.buildingLine',
                message: `I’m picking places for the crew. It takes about ${DECK_MINUTES} minutes.`,
              })
        }
        testID="swipe-building-note"
      />
    </View>
  );
}
