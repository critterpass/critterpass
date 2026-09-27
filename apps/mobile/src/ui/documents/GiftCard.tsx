import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { CardTone } from '../cards/tone';
import { cardBackground, surfaceToneOf } from '../cards/tone';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { Halftone } from '../textures/halftone';
import { makeStyles, useTheme } from '../theme';

export interface GiftCardProps {
  /** "Pass+ · 1 year". */
  readonly title: string;
  /** "From Maya". */
  readonly from: string;
  readonly message?: string;
  /** Redeem code, shown in 4-4-4 groups. */
  readonly code?: string;
  readonly art?: ReactNode;
  /** @default 'pink' */
  readonly tone?: CardTone;
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

/** Groups a 12-character code as `ABCD-EFGH-IJKL`. */
export function formatGiftCode(code: string): string {
  return (
    code
      .replace(/[^0-9a-z]/gi, '')
      .toUpperCase()
      .match(/.{1,4}/g) ?? []
  ).join('-');
}

const useStyles = makeStyles((t) => ({
  card: {
    aspectRatio: 1.6,
    borderRadius: t.radius.cardBig,
    padding: t.size.cardInner.max,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  art: { position: 'absolute', end: t.space['12'], top: t.space['12'] },
  code: {
    alignSelf: 'flex-start',
    backgroundColor: t.color.paper.bright,
    borderRadius: t.radius.xs,
    paddingHorizontal: t.space['8'],
    paddingVertical: t.space['4'],
  },
}));

/** A gift card (4d family): colour + halftone, title, from line, message and grouped code. */
export function GiftCard({
  title,
  from,
  message,
  code,
  art,
  tone = 'pink',
  accessibilityLabel,
  testID,
}: GiftCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: cardBackground(theme, tone) }]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel}
    >
      <SurfaceToneProvider value={surfaceToneOf(tone)}>
        <Halftone />
        {art ? <View style={styles.art}>{art}</View> : null}
        <Stack gap="4">
          <Text variant="label">{from}</Text>
          <Text variant="h2">{title}</Text>
          {message ? <Text variant="voice">{message}</Text> : null}
        </Stack>
        {code ? (
          <Row>
            <View style={styles.code}>
              <Text variant="monoData" color={theme.color.paper.ink}>
                {formatGiftCode(code)}
              </Text>
            </View>
          </Row>
        ) : null}
      </SurfaceToneProvider>
    </View>
  );
}
