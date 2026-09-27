import type { ReactNode } from 'react';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface LegendaryBannerProps {
  /** "Legendary on your dates". */
  readonly eyebrow: string;
  /** "Sakura Pon · Kyoto, Apr 2–9". */
  readonly title: string;
  /** Gold silhouette slot. */
  readonly silhouette?: ReactNode;
  readonly onPress?: () => void;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  row: {
    borderRadius: th.radius.lg,
    borderWidth: th.space['2'],
    borderColor: th.color.gold.base,
    backgroundColor: th.color.gold.dark,
    padding: th.space['12'],
  },
}));

/** Gold-outlined row pointing at a legendary that falls on your dates. */
export function LegendaryBanner({
  eyebrow,
  title,
  silhouette,
  onPress,
  testID,
}: LegendaryBannerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const body = (
    <Row gap="12" align="center">
      {silhouette}
      <Stack gap="2" flex={1}>
        <Text variant="label" color={theme.tier.legendary.color}>
          {eyebrow}
        </Text>
        <Text variant="title">{title}</Text>
      </Stack>
      {onPress ? (
        <Text variant="h3" color={theme.tier.legendary.color}>
          ›
        </Text>
      ) : null}
    </Row>
  );
  return (
    <PressScale
      testID={testID}
      accessibilityLabel={`${eyebrow}, ${title}`}
      accessibilityRole={onPress ? 'button' : 'text'}
      {...(onPress ? { onPress } : {})}
      widthClass="wide"
      style={styles.row}
    >
      {body}
    </PressScale>
  );
}
