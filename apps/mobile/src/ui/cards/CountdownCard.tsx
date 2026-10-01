import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';
import { Card } from './Card';
import type { CardTone } from './tone';

export interface CountdownCardProps {
  /** "Next up · Oct 12". */
  readonly eyebrow: string;
  /** Destination name, set in the mega display face and auto-fitted to one line. */
  readonly title: string;
  /** Countdown and plan chips under the title (`Countdown`, `InfoPill`, …). */
  readonly meta?: ReactNode;
  /** Guide sticker in the top end corner. */
  readonly sticker?: ReactNode;
  /**
   * The sticker's width in points: the title keeps clear of it and auto-fits to the width left,
   * so the sticker never covers the destination's last letters.
   */
  readonly stickerSize?: number;
  /** Destination colour. @default 'yellow' */
  readonly tone?: CardTone;
  /** Screen-reader summary of `meta` ("17 days to go, plan 80 percent done"). */
  readonly metaLabel?: string;
  readonly onPress?: () => void;
  readonly testID?: string;
  /** Drawn on the fill under the content (a destination photo). */
  readonly backdrop?: ReactNode;
  /** `tex.halftone`; off where the backdrop draws its own. @default true */
  readonly halftone?: boolean;
}

const useStyles = makeStyles((t) => ({
  sticker: { position: 'absolute', top: t.space['8'], end: t.space['8'] },
  title: { paddingEnd: t.space['32'] },
}));

/** Home's next-trip hero card (3b-2): eyebrow, mega destination, countdown chips, guide sticker. */
export function CountdownCard({
  eyebrow,
  title,
  meta,
  sticker,
  stickerSize,
  tone = 'yellow',
  metaLabel,
  onPress,
  testID,
  backdrop,
  halftone = true,
}: CountdownCardProps) {
  const styles = useStyles();
  const label = [eyebrow, title, metaLabel].filter(Boolean).join(', ');
  return (
    <Card
      tone={tone}
      halftone={halftone}
      backdrop={backdrop}
      radius="cardBig"
      accessibilityLabel={label}
      {...(onPress ? { onPress } : {})}
      {...(testID ? { testID } : {})}
    >
      {sticker ? (
        <View style={styles.sticker} pointerEvents="none">
          {sticker}
        </View>
      ) : null}
      <Stack gap="8">
        <Text variant="eyebrow">{eyebrow}</Text>
        <Text
          variant="displayMega"
          style={[
            styles.title,
            sticker && stickerSize !== undefined ? { paddingEnd: stickerSize } : null,
          ]}
        >
          {title}
        </Text>
        {meta ? (
          <Row gap="8" wrap>
            {meta}
          </Row>
        ) : null}
      </Stack>
    </Card>
  );
}
