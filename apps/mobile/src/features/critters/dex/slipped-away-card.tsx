/**
 * The PASS tab's note for a find that slipped away (an undesigned state, logged in
 * docs/undesigned-states.md): the encounter card's raised surface with the find's tier and place,
 * a title, why, and OK to put it away.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card } from '@/ui/cards/Card';
import { PillButton } from '@/ui/buttons/PillButton';
import { tierWord } from '@/ui/critters/tier';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { SlippedAway } from './slipped-away';

export function SlippedAwayCard({
  slipped,
  onDismiss,
}: {
  readonly slipped: SlippedAway;
  readonly onDismiss: () => void;
}) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const place = slipped.place;
  // Which find it was: its tier and where, never a name the traveller didn't get to keep.
  const tier = slipped.rarity === null ? null : tierWord(slipped.rarity);
  const eyebrow =
    tier === null
      ? (place ?? t({ id: 'critters.slipped.eyebrow', message: 'Slipped away' }))
      : place === null
        ? t({ id: 'critters.slipped.eyebrowTier', message: `${tier} form` })
        : t({ id: 'critters.slipped.eyebrowTierAt', message: `${tier} · ${place}` });
  const body =
    place === null
      ? t({
          id: 'critters.slipped.body',
          message: "We couldn't confirm that find, so it didn't stay. Come back and try again.",
        })
      : t({
          id: 'critters.slipped.bodyAt',
          message: `We couldn't confirm the find at ${place}, so it didn't stay. Come back and try again.`,
        });
  return (
    <Card tone="raised" testID="critters-slipped-away">
      <Stack gap="6">
        <Text variant="eyebrow" color={theme.semantic.text.secondary}>
          {upper(eyebrow, locale)}
        </Text>
        <Text variant="title">
          {upper(t({ id: 'critters.slipped.title', message: 'This one slipped away' }), locale)}
        </Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {body}
        </Text>
        <PillButton
          label={t({ id: 'critters.slipped.ok', message: 'OK' })}
          variant="secondary"
          size="sm"
          block={false}
          onPress={onDismiss}
          testID="critters-slipped-away-ok"
        />
      </Stack>
    </Card>
  );
}
