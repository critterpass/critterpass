/**
 * Card 2, the new locals (undesigned; built from the cover's stickers and the summary's forms
 * card): the forms found on the trip tumble one after another into a pile under "{n} NEW LOCALS".
 */
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useSettle } from '@/motion/patterns/settle';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Sticker } from '@/ui/sticker/Sticker';
import { makeStyles, useTheme } from '@/ui/theme';

import { artKind, formSpec } from '../data/critter-art';
import type { FormRow } from '../data/recap-rows';
import { useCardTimeline } from '../story/use-card-timeline';
import { CardShell } from './card-shell';

const STICKER = 112;
const TUMBLE_GAP_MS = 420;
const PILE_MAX = 9;
/** Where each sticker lands in the pile: offsets from the pile's centre and a resting angle. */
const PILE = [
  { x: 0, y: 0, r: -6 },
  { x: -70, y: 30, r: 9 },
  { x: 72, y: 24, r: -11 },
  { x: -36, y: -60, r: 4 },
  { x: 44, y: -54, r: -3 },
  { x: -96, y: -28, r: 12 },
  { x: 98, y: -26, r: -8 },
  { x: 0, y: 70, r: 6 },
  { x: 0, y: -110, r: -5 },
] as const;

const useStyles = makeStyles(() => ({
  pile: { flex: 1, alignItems: 'center', justifyContent: 'center' },
}));

function Tumbling({
  form,
  index,
  landed,
}: {
  readonly form: FormRow;
  readonly index: number;
  readonly landed: boolean;
}) {
  const settle = useSettle({ active: landed });
  const spot = PILE[index % PILE.length] ?? PILE[0];
  const spec = formSpec(form);
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          transform: [{ translateX: spot.x }, { translateY: spot.y }, { rotate: `${spot.r}deg` }],
          opacity: landed ? 1 : 0,
        },
      ]}
    >
      <Animated.View style={settle}>
        <Sticker
          kind={artKind(form.critter_key)}
          name={form.city ?? ''}
          size={STICKER}
          {...(spec === null ? {} : { form: spec })}
          {...(form.canonical_seed === null ? {} : { seed: form.canonical_seed })}
        />
      </Animated.View>
    </Animated.View>
  );
}

export interface CrittersCardProps {
  readonly eyebrow: string;
  readonly headline: string;
  readonly line: string;
  readonly forms: readonly FormRow[];
}

export function CrittersCard({ eyebrow, headline, line, forms }: CrittersCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const shown = forms.slice(0, PILE_MAX);
  const reached = useCardTimeline(shown.map((_, index) => 300 + index * TUMBLE_GAP_MS));
  return (
    <CardShell
      ground={theme.semantic.bg.base}
      tone="dark"
      eyebrow={eyebrow}
      headline={headline}
      testID="recap-card-critters"
    >
      <SecondaryText variant="body">{line}</SecondaryText>
      <View style={styles.pile}>
        {shown.map((form, index) => (
          <Tumbling key={form.id} form={form} index={index} landed={reached > index} />
        ))}
      </View>
    </CardShell>
  );
}
