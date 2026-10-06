/**
 * One driver in the directory (6e-1): initials avatar, name, what he does and where, the crews'
 * heart line (hidden when he turned ratings off), trips, the tags crews agreed on, then languages
 * and car. Tapping opens his detail.
 */
import { upper } from '@cp/i18n';
import type { DriverDirectoryCard } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { Pressable, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { isDriverTag, TAG_LABELS } from '../rating/labels';

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
    gap: t.space['12'],
  },
  initials: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    backgroundColor: t.semantic.bg.control,
    borderRadius: t.radius.pill,
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
  },
}));

export function initialsColour(theme: ReturnType<typeof useTheme>, id: string): string {
  const palette = [theme.color.green.base, theme.color.pink, theme.color.yellow, theme.color.blue];
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return palette[sum % palette.length] ?? theme.color.yellow;
}

/** `Toyota HiAce, 10 seats`, `10 seats`, `Toyota HiAce`, or nothing. */
export function useVehicleLine(
  driver: Pick<DriverDirectoryCard, 'vehicle' | 'seats'>,
): string | null {
  const { t } = useLingui();
  const seats = driver.seats ?? driver.vehicle?.seats ?? null;
  const model = driver.vehicle?.model ?? null;
  if (seats === null) return model;
  if (model === null) return t({ id: 'drivers.card.seats', message: `${seats} seats` });
  return t({ id: 'drivers.card.car', message: `${model}, ${seats} seats` });
}

export function DriverCard({
  driver,
  onPress,
}: {
  readonly driver: DriverDirectoryCard;
  readonly onPress: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t, i18n } = useLingui();
  const role = t({ id: 'drivers.card.role', message: 'Driver' });
  const where = driver.areas.join(', ');
  const carLine = useVehicleLine(driver);
  const trips = driver.trips;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={driver.display_name}
      testID={`drivers-card-${driver.id}`}
    >
      <Stack style={styles.card}>
        <Row gap="12" align="center">
          <View style={[styles.initials, { backgroundColor: initialsColour(theme, driver.id) }]}>
            <Text variant="title" color={theme.semantic.text.onAccent}>
              {driver.display_name.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <Stack gap="2" style={{ flex: 1 }}>
            <Text variant="rowTitle">{upper(driver.display_name, locale)}</Text>
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {`${role} · ${where}`}
            </Text>
          </Stack>
          <Stack gap="2" style={{ alignItems: 'flex-end' }}>
            {driver.crews_rated !== null && driver.crews_rated > 0 ? (
              <Row gap="4" align="center">
                <Icon name="heart" size={16} color={theme.color.pink} decorative />
                <Text variant="title" testID={`drivers-card-hearts-${driver.id}`}>
                  {`${driver.crews_loved ?? 0}/${driver.crews_rated}`}
                </Text>
              </Row>
            ) : null}
            <Text variant="caption" color={theme.semantic.text.secondary}>
              {t({ id: 'drivers.card.trips', message: `${trips} trips` })}
            </Text>
          </Stack>
        </Row>
        {driver.top_tags.length > 0 ? (
          <Row gap="6" style={{ flexWrap: 'wrap' }}>
            {driver.top_tags.filter(isDriverTag).map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text variant="label">{upper(i18n._(TAG_LABELS[tag]), locale)}</Text>
              </View>
            ))}
          </Row>
        ) : null}
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {[driver.languages.join(', '), carLine].filter(Boolean).join(' · ')}
        </Text>
      </Stack>
    </Pressable>
  );
}
