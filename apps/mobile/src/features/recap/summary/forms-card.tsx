/**
 * The recap page's forms card (3m-1): the got-away critter's forms (found ones as stickers, the
 * rest as silhouettes, the one that got away in gold) or, when nothing got away, this trip's finds,
 * with "3 OF 4 FOUND" and the got-away line under them. Opens that critter (or the destination's own) when it can.
 */
import { View } from 'react-native';

import { Card } from '@/ui/cards/Card';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { SilhouetteSlot } from '@/ui/sticker/SilhouetteSlot';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { artKind, formSpec } from '../data/critter-art';
import type { SummaryFormsCard } from './summary-model';

const STICKER_SIZE = 64;

export interface FormsCardProps {
  readonly card: SummaryFormsCard;
  readonly eyebrow: string;
  readonly count: string;
  readonly line: string | null;
  readonly onPress?: (() => void) | undefined;
}

export function FormsCard({ card, eyebrow, count, line, onPress }: FormsCardProps) {
  const theme = useTheme();
  const tiers = theme.tier;
  return (
    <Card
      tone="raised"
      testID="recap-forms"
      {...(onPress === undefined ? {} : { onPress, accessibilityLabel: `${eyebrow}, ${count}` })}
    >
      <Stack gap="14">
        <Row justify="space-between" align="center">
          <Text variant="eyebrow" color={theme.semantic.text.primary}>
            {eyebrow}
          </Text>
          <Text variant="eyebrow">{count}</Text>
        </Row>
        <Row justify="space-around" align="center">
          {card.forms.map((form) => {
            const kind = artKind(form.row.critter_key);
            const seed = form.row.canonical_seed ?? undefined;
            const city = form.row.city ?? '';
            if (form.found) {
              const spec = formSpec(form.row);
              return (
                <Sticker
                  key={form.id}
                  kind={kind}
                  name={city}
                  size={STICKER_SIZE}
                  {...(spec === null ? {} : { form: spec })}
                  {...(seed === undefined ? {} : { seed })}
                />
              );
            }
            return (
              <View key={form.id} testID={form.gotAway ? 'recap-forms-got-away' : undefined}>
                <SilhouetteSlot
                  kind={kind}
                  city={city}
                  size={STICKER_SIZE}
                  maskColor={
                    form.gotAway ? tiers.locked.legendary.silhouette : tiers.locked.default
                  }
                  glyphColor={form.gotAway ? tiers.legendary.color : tiers.epic.color}
                  {...(seed === undefined ? {} : { seed })}
                />
              </View>
            );
          })}
        </Row>
        {line === null ? null : (
          <SecondaryText variant="body" testID="recap-got-away-line">
            {line}
          </SecondaryText>
        )}
      </Stack>
    </Card>
  );
}
