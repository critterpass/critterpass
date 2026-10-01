import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Card } from '../cards/Card';
import { ProgressRing } from '../data/ProgressRing';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface LeaveByHeroProps {
  /** "Thu Oct 15 · Day 4". */
  readonly eyebrow: string;
  /** End of the eyebrow row ("9° at the top"). */
  readonly trailing?: string;
  /** "Leave by". */
  readonly label: string;
  /** Giant clock time ("03:10"); decorative, `spokenTime` is read instead. */
  readonly time: string;
  /** Time as it should be spoken ("3:10 AM"). */
  readonly spokenTime: string;
  readonly instructions?: string;
  /** Drain ring: fraction left and its centre text ("21:29", "to go"). */
  readonly ring?: {
    readonly progress: number;
    readonly value: string;
    readonly caption: string;
    readonly spoken: string;
  };
  /** Crew-up avatars (sleepers bob). */
  readonly crew?: ReactNode;
  /** "4 of 6 are up". */
  readonly crewLabel?: string;
  readonly crewDetail?: string;
  readonly testID?: string;
  /** Drawn on the fill under the content (the destination's photo). */
  readonly backdrop?: ReactNode;
  /** `tex.halftone` on the flood; off where the backdrop draws its own. @default true */
  readonly halftone?: boolean;
}

const useStyles = makeStyles((th) => ({
  hero: {
    borderTopStartRadius: 0,
    borderTopEndRadius: 0,
    borderBottomStartRadius: th.radius.heroBottom,
    borderBottomEndRadius: th.radius.heroBottom,
  },
}));

/** Day-of alarm hero: giant leave-by time, instructions, a draining ring and who is up. */
export function LeaveByHero({
  eyebrow,
  trailing,
  label,
  time,
  spokenTime,
  instructions,
  ring,
  crew,
  crewLabel,
  crewDetail,
  testID,
  backdrop,
  halftone = true,
}: LeaveByHeroProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Card
      tone="pink"
      halftone={halftone}
      backdrop={backdrop}
      style={styles.hero}
      {...(testID ? { testID } : {})}
    >
      <Stack gap="12">
        <Row justify="space-between">
          <Text variant="eyebrow">{eyebrow}</Text>
          {trailing ? <Text variant="eyebrow">{trailing}</Text> : null}
        </Row>
        <Stack accessible accessibilityRole="header" accessibilityLabel={`${label} ${spokenTime}`}>
          <Text variant="eyebrow">{label}</Text>
          <Text variant="displayMega" autoFit>
            {time}
          </Text>
        </Stack>
        <Row gap="12" align="center">
          {instructions ? (
            <Text variant="bodyLg" style={{ flex: 1 }}>
              {instructions}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {ring ? (
            <ProgressRing
              progress={ring.progress}
              size={theme.space['32'] * 3}
              stroke={theme.space['10']}
              color={theme.semantic.text.onAccent}
              accessibilityLabel={ring.spoken}
            >
              <Text variant="h3">{ring.value}</Text>
              <Text variant="label">{ring.caption}</Text>
            </ProgressRing>
          ) : null}
        </Row>
        {crew || crewLabel ? (
          <Row gap="12" align="center">
            {crew}
            <Stack
              gap="2"
              flex={1}
              accessible
              accessibilityRole="text"
              accessibilityLabel={[crewLabel, crewDetail].filter(Boolean).join(', ')}
            >
              {crewLabel ? <Text variant="title">{crewLabel}</Text> : null}
              {crewDetail ? <Text variant="bodySm">{crewDetail}</Text> : null}
            </Stack>
          </Row>
        ) : null}
      </Stack>
    </Card>
  );
}
