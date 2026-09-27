import type { ReactNode } from 'react';
import { View } from 'react-native';

import { StatusChip, statusWord } from '../chips/StatusChip';
import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';

export interface LockedTeaserProps {
  /** Which entitlement unlocks it. */
  readonly plan: 'passPlus' | 'boost';
  /** Server-driven perk line ("See every crew's flights live"). */
  readonly perk: string;
  /** A dimmed preview of the locked feature. */
  readonly preview?: ReactNode;
  /** Opens the governed offer; closing it always returns here. */
  readonly onPress: () => void;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.size.cardInner.max,
    gap: t.space['10'],
    overflow: 'hidden',
  },
  preview: { opacity: 0.35 },
}));

/**
 * A paywall-locked feature: lock + PASS+/BOOST chip, the perk line and a dimmed preview. Tapping
 * opens the offer. Never used on safety or on-time features.
 */
export function LockedTeaser({ plan, perk, preview, onPress, testID }: LockedTeaserProps) {
  const styles = useStyles();
  return (
    <PressScale
      testID={testID}
      onPress={onPress}
      widthClass="wide"
      accessibilityLabel={`${statusWord(plan)}: ${perk}`}
      style={styles.card}
    >
      <Row gap="8" align="center">
        <Icon name="lock" size={18} decorative />
        <StatusChip status={plan} />
      </Row>
      <Text variant="title">{perk}</Text>
      {preview ? (
        <View
          style={styles.preview}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          <Stack>{preview}</Stack>
        </View>
      ) : null}
    </PressScale>
  );
}
