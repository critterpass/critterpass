import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SecondaryText } from '../cards/SecondaryText';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface GotAwayProps {
  /** Gold silhouette slot. */
  readonly silhouette: ReactNode;
  /** "The one that got away". */
  readonly eyebrow: string;
  readonly name: string;
  readonly story: string;
  /** "3 of 4 forms". */
  readonly formsLabel?: string;
  /** Remind-me action. */
  readonly action?: ReactNode;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  root: { alignItems: 'center', gap: th.space['12'], padding: th.space['24'] },
  glow: {
    width: th.space['32'] * 6,
    height: th.space['32'] * 6,
    borderRadius: th.space['32'] * 3,
    backgroundColor: th.color.gold.dark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: th.color.gold.base,
    shadowOpacity: 0.6,
    shadowRadius: th.space['32'],
  },
}));

/** The legendary that escaped: gold silhouette in a warm glow, the story and a remind-me action. */
export function GotAway({
  silhouette,
  eyebrow,
  name,
  story,
  formsLabel,
  action,
  testID,
}: GotAwayProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack style={styles.root} testID={testID}>
      <View style={styles.glow}>{silhouette}</View>
      <Stack
        gap="6"
        align="center"
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${eyebrow}: ${name}`}
      >
        <Text variant="eyebrow" color={theme.tier.legendary.color}>
          {eyebrow}
        </Text>
        <Text variant="displayXl" autoFit color={theme.color.gold.base}>
          {name}
        </Text>
      </Stack>
      <SecondaryText variant="body" style={{ textAlign: 'center' }}>
        {story}
      </SecondaryText>
      {formsLabel ? <Text variant="label">{formsLabel}</Text> : null}
      {action}
    </Stack>
  );
}
