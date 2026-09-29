import type { ReactNode } from 'react';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { Card } from './Card';
import { SecondaryText } from './SecondaryText';

export interface SuggestionCardProps {
  /** "Pon's pick", "Nearby". */
  readonly eyebrow?: string;
  readonly title: string;
  /** Why it is suggested, in the guide's voice. */
  readonly reason?: string;
  /** Guide colour for the reason line (Mynerve voice); defaults to the surface's secondary. */
  readonly voiceColor?: string;
  readonly art?: ReactNode;
  /** Add / accept / dismiss controls. */
  readonly actions?: ReactNode;
  readonly onPress?: () => void;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  art: { width: t.size.avatar.xl, alignItems: 'center' },
}));

/** A guide or system suggestion: art, eyebrow, title, voiced reason, actions. */
export function SuggestionCard({
  eyebrow,
  title,
  reason,
  voiceColor,
  art,
  actions,
  onPress,
  testID,
}: SuggestionCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const label = [eyebrow, title, reason].filter(Boolean).join(', ');
  const content = (
    <Row gap="12" align="center">
      {art ? <Stack style={styles.art}>{art}</Stack> : null}
      <Stack gap="4" flex={1}>
        {eyebrow ? <Text variant="eyebrow">{eyebrow}</Text> : null}
        <Text variant="title">{title}</Text>
        {reason ? (
          voiceColor ? (
            <Text variant="voice" color={voiceColor}>
              {reason}
            </Text>
          ) : (
            <SecondaryText>{reason}</SecondaryText>
          )
        ) : null}
      </Stack>
    </Row>
  );
  if (!actions) {
    return (
      <Card
        accessibilityLabel={label}
        {...(onPress ? { onPress } : {})}
        {...(testID ? { testID } : {})}
      >
        {content}
      </Card>
    );
  }
  // With actions the card is not one element: each action stays separately focusable.
  return (
    <Card {...(testID ? { testID } : {})} style={{ gap: theme.space['12'] }}>
      <Stack accessible accessibilityLabel={label}>
        {content}
      </Stack>
      <Row gap="8" wrap>
        {actions}
      </Row>
    </Card>
  );
}
