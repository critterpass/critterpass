import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AccessibilityActionEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { NEXT_CARD_ENTRY, useSwipeDeck } from '@/motion/gestures/swipe-deck';
import type { SwipeDirection } from '@/motion/gestures/swipe-deck';

import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill } from '../plan/ActionPill';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface DeckCard {
  readonly id: string;
  /** One-line spoken summary of the card ("Tirta Empul, water temple, 45 minutes away"). */
  readonly label: string;
  readonly content: ReactNode;
}

const useStyles = makeStyles((th) => ({
  deck: { minHeight: th.space['32'] * 10 },
  card: { position: 'absolute', inset: 0, borderRadius: th.radius.cardBig, overflow: 'hidden' },
  next: {
    transform: [{ translateY: NEXT_CARD_ENTRY.translateY }, { scale: NEXT_CARD_ENTRY.scale }],
    opacity: 0.6,
  },
}));

function TopCard({
  card,
  onSwiped,
  actions,
}: {
  readonly card: DeckCard;
  readonly onSwiped: (direction: SwipeDirection) => void;
  readonly actions: readonly { readonly name: string; readonly label: string }[];
}) {
  const styles = useStyles();
  const deck = useSwipeDeck({ onSwiped, accessibilityLabel: card.label });
  return (
    <GestureDetector gesture={deck.gesture}>
      <Animated.View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={card.label}
        accessibilityActions={actions}
        onAccessibilityAction={(event: AccessibilityActionEvent) =>
          deck.onAccessibilityAction(event)
        }
        style={[styles.card, deck.animatedStyle]}
      >
        {card.content}
      </Animated.View>
    </GestureDetector>
  );
}

/** The fling deck shared by swipe and rate stacks: top card drags, the next waits underneath. */
export function CardDeck({
  cards,
  onSwiped,
  leftLabel,
  rightLabel,
}: {
  readonly cards: readonly DeckCard[];
  readonly onSwiped: (id: string, direction: SwipeDirection) => void;
  readonly leftLabel: string;
  readonly rightLabel: string;
}) {
  const styles = useStyles();
  const [top, next] = cards;
  return (
    <View style={styles.deck}>
      {next ? (
        <View style={[styles.card, styles.next]} importantForAccessibility="no-hide-descendants">
          {next.content}
        </View>
      ) : null}
      {top ? (
        <TopCard
          key={top.id}
          card={top}
          onSwiped={(direction) => onSwiped(top.id, direction)}
          actions={[
            { name: 'swipeLeft', label: leftLabel },
            { name: 'swipeRight', label: rightLabel },
          ]}
        />
      ) : null}
    </View>
  );
}

export interface SwipeStackProps {
  /** Remaining cards, top first. */
  readonly cards: readonly DeckCard[];
  /** `yes` = right fling or the heart button; `no` = left fling or ✕. */
  readonly onAnswer: (id: string, answer: 'yes' | 'no') => void;
  /** "12/30 · 3 matches". */
  readonly progressLabel?: string;
  /** Middle action ("Why this?"). */
  readonly middleAction?: ReactNode;
  /** Shown when the deck is empty. */
  readonly empty?: ReactNode;
  readonly testID?: string;
}

/** Swipe-together deck: fling right for yes, left for no, or use the ✕ / ♥ buttons. */
export function SwipeStack({
  cards,
  onAnswer,
  progressLabel,
  middleAction,
  empty,
  testID,
}: SwipeStackProps) {
  const theme = useTheme();
  const top = cards[0];
  const yes = t({ id: 'common.vote.yes', message: 'Yes' });
  const no = t({ id: 'common.vote.no', message: 'No' });
  if (!top) return <View testID={testID}>{empty}</View>;
  return (
    <Stack gap="16" testID={testID}>
      {progressLabel ? (
        <Text variant="label" color={theme.semantic.text.secondary}>
          {progressLabel}
        </Text>
      ) : null}
      <CardDeck
        cards={cards}
        leftLabel={no}
        rightLabel={yes}
        onSwiped={(id, direction) => onAnswer(id, direction === 'right' ? 'yes' : 'no')}
      />
      <Row gap="12" justify="center" align="center">
        <ActionPill
          round
          label={no}
          icon={<Text variant="h3">✕</Text>}
          accessibilityLabel={t({ id: 'common.vote.noTo', message: `No to ${top.label}` })}
          onPress={() => onAnswer(top.id, 'no')}
        />
        {middleAction}
        <ActionPill
          round
          tone="urgent"
          label={yes}
          icon={<Icon name="heart" size={theme.space['24']} decorative />}
          accessibilityLabel={t({ id: 'common.vote.yesTo', message: `Yes to ${top.label}` })}
          onPress={() => onAnswer(top.id, 'yes')}
        />
      </Row>
    </Stack>
  );
}
