/**
 * Under an active "befriend" quest: the nearest place a critter can be met, how far it is, GO for
 * directions in the phone's maps app, and how meeting one works. Built from the card's own text
 * and button parts (an undesigned state, logged in docs/undesigned-states.md).
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Linking } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { directionsUrl } from './befriend-spot';
import type { BefriendPlace } from './use-befriend-spot';
import { currentFormats } from '@/lib/i18n/formats';

export function BefriendWhere({
  id,
  place,
}: {
  readonly id: string;
  readonly place: BefriendPlace;
}) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { spot } = place;
  const how = t({
    id: 'quests.befriend.how',
    message: 'Stay about 5 minutes nearby with CritterPass open.',
  });
  if (spot === null) {
    return (
      <Text
        variant="bodySm"
        color={theme.semantic.text.secondary}
        testID={`quest-befriend-how-${id}`}
      >
        {how}
      </Text>
    );
  }
  const name = spot.name;
  // Settings' km/mi (the spot's own unit field read a value the setting never takes).
  const unit = currentFormats().distance === 'mi' ? 'imperial' : 'metric';
  const away = spot.distanceM === null ? null : format.distance(locale, spot.distanceM, unit);
  const nearest =
    away === null
      ? t({ id: 'quests.befriend.nearest', message: `Nearest: ${name}` })
      : t({ id: 'quests.befriend.nearestAway', message: `Nearest: ${name} · ${away}` });
  return (
    <Stack gap="8" style={{ alignSelf: 'stretch' }} testID={`quest-befriend-${id}`}>
      <Row gap="12" align="center">
        <Text variant="body" style={{ flex: 1 }} testID={`quest-befriend-spot-${id}`}>
          {nearest}
        </Text>
        <PillButton
          label={t({ id: 'quests.befriend.go', message: 'Go' })}
          size="sm"
          block={false}
          onPress={() => void Linking.openURL(directionsUrl(spot)).catch(() => false)}
          testID={`quest-befriend-go-${id}`}
        />
      </Row>
      <Text
        variant="bodySm"
        color={theme.semantic.text.secondary}
        testID={`quest-befriend-how-${id}`}
      >
        {how}
      </Text>
    </Stack>
  );
}
