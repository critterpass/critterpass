/**
 * One change the guide offers in voice mode (3j-2): a tilted colour card with what comes in, the
 * guide's one-line reason and, at the end, what each person's share moves by. The cards deal in
 * one after the other.
 */
import Animated from 'react-native-reanimated';

import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { patterns } from '@/motion';
import { Row, Stack, Text, makeStyles } from '@/ui';
import { Card } from '@/ui/cards/Card';
import type { CardTone } from '@/ui/cards/tone';

export interface VoiceSwap {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  /** "+$18": what each person's share moves by, when this change alone sets it. */
  readonly delta: string | null;
}

const TONES: readonly CardTone[] = ['blue', 'green', 'yellow'];
const TILT_DEG = 1.5;

const useStyles = makeStyles((t) => ({
  card: { paddingVertical: t.space['12'], paddingHorizontal: t.space['16'] },
}));

export function VoiceSwapCard({
  swap,
  index,
}: {
  readonly swap: VoiceSwap;
  readonly index: number;
}) {
  const styles = useStyles();
  const { i18n } = useLingui();
  const dealt = patterns.useDeal({ active: true, index });
  const tilt = index % 2 === 0 ? -TILT_DEG : TILT_DEG;
  return (
    <Animated.View style={dealt}>
      <Card
        tone={TONES[index % TONES.length] ?? 'blue'}
        style={[styles.card, { transform: [{ rotate: `${tilt}deg` }] }]}
        accessibilityLabel={[swap.title, swap.detail, swap.delta].filter(Boolean).join(', ')}
        testID={`guide-voice-swap-${index}`}
      >
        <Row gap="12" align="center" justify="space-between">
          <Stack gap="2" flex={1}>
            <Text variant="title">{upper(swap.title, i18n.locale)}</Text>
            {swap.detail === '' ? null : <Text variant="bodySm">{swap.detail}</Text>}
          </Stack>
          {swap.delta === null ? null : <Text variant="title">{swap.delta}</Text>}
        </Row>
      </Card>
    </Animated.View>
  );
}
