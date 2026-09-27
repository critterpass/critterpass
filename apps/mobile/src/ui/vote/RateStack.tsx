import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill } from '../plan/ActionPill';
import { Text } from '../text/Text';
import { useTheme } from '../theme';
import { CardDeck } from './SwipeStack';
import type { DeckCard } from './SwipeStack';

export type Rating = 'loved' | 'fine' | 'skip';

export interface RateStackProps {
  readonly cards: readonly DeckCard[];
  readonly onRate: (id: string, rating: Rating) => void;
  /** "3 of 11". */
  readonly progressLabel?: string;
  /** Below the buttons (tip field). */
  readonly footer?: ReactNode;
  readonly empty?: ReactNode;
  readonly testID?: string;
}

/** Rate-the-trip deck: fling right to love, left to skip, or tap Loved it / Fine / Skip it. */
export function RateStack({ cards, onRate, progressLabel, footer, empty, testID }: RateStackProps) {
  const theme = useTheme();
  const top = cards[0];
  const loved = t({ id: 'common.vote.lovedIt', message: 'Loved it' });
  const fine = t({ id: 'common.vote.fine', message: 'Fine' });
  const skip = t({ id: 'common.vote.skipIt', message: 'Skip it' });
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
        leftLabel={skip}
        rightLabel={loved}
        onSwiped={(id, direction) => onRate(id, direction === 'right' ? 'loved' : 'skip')}
      />
      <Row gap="8" justify="center" wrap>
        <ActionPill tone="urgent" label={loved} onPress={() => onRate(top.id, 'loved')} />
        <ActionPill label={fine} onPress={() => onRate(top.id, 'fine')} />
        <ActionPill tone="outline" label={skip} onPress={() => onRate(top.id, 'skip')} />
      </Row>
      {footer}
    </Stack>
  );
}
