import type { ReactNode } from 'react';

import { SecondaryText } from '../cards/SecondaryText';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import type { Tier } from './tier';
import { TierWord, tierLine } from './tier';

export interface EncounterCardProps {
  readonly tier: Tier;
  /** "Water temples only". */
  readonly habitat?: string;
  /** "A temple Tokek is here". */
  readonly title: string;
  readonly body?: string;
  /** The hold-to-befriend ring (or the next-window action when it wandered off). */
  readonly action?: ReactNode;
  /** Line under the action ("Tokek's rare form, 2 of 4"). */
  readonly footnote?: string;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.base,
    borderTopStartRadius: th.radius.sheetTop,
    borderTopEndRadius: th.radius.sheetTop,
    padding: th.space['20'],
    gap: th.space['10'],
    alignItems: 'center',
  },
}));

/** Bottom card over the camera during an encounter: tier line, headline, body, hold action. */
export function EncounterCard({
  tier,
  habitat,
  title,
  body,
  action,
  footnote,
  testID,
}: EncounterCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack style={styles.card} testID={testID}>
      <Stack
        gap="6"
        align="center"
        accessible
        accessibilityRole="header"
        accessibilityLabel={[tierLine(tier, habitat), title].join('. ')}
      >
        <TierWord tier={tier} {...(habitat ? { suffix: habitat } : {})} />
        <Text variant="h1" style={{ textAlign: 'center' }}>
          {title}
        </Text>
      </Stack>
      {body ? (
        <SecondaryText variant="body" style={{ textAlign: 'center' }}>
          {body}
        </SecondaryText>
      ) : null}
      {action}
      {footnote ? (
        <Text variant="caption" color={theme.semantic.text.secondary}>
          {footnote}
        </Text>
      ) : null}
    </Stack>
  );
}
