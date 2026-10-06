/**
 * Your ride back (6e-4), at the top of Getting around on a day a driver is set: who, when, the car
 * and plate, the pickup spot and what was agreed, all saved on the phone (the day from the synced
 * trip, his number from the last driver read) so it works with no data. CALL uses the dialer (signal,
 * not data); WHATSAPP opens his chat, and WhatsApp sends it once the phone is back online.
 */
import { telLink, whatsappLink } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Linking, View } from 'react-native';

import { useOnline } from '@/data/places/server-name-search';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { money } from '../shared/format';
import { cachedDrivers, useAssignments } from '../shared/use-drivers';

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
  },
  saved: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['14'],
  },
}));

interface Agreed {
  readonly price_minor?: string | number | null;
  readonly currency?: string | null;
  readonly includes?: Readonly<Record<string, string>>;
}

const parse = <T,>(raw: string | null): T | null => {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export function RideBackCard({ tripId, date }: { readonly tripId: string; readonly date: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const online = useOnline();
  const { rows } = useAssignments(tripId);
  const today = rows.find((row) => row.day_date === date);
  if (today === undefined) return null;
  const saved = cachedDrivers(tripId);
  const driver = saved?.drivers.find((d) => d.id === today.provider_id);
  const name = today.name ?? driver?.name ?? '';
  const vehicle = parse<{ model?: string; plate?: string }>(today.vehicle);
  const agreed = parse<Agreed>(today.agreed);
  const phone = driver?.phone ?? null;
  const price =
    agreed?.price_minor == null
      ? null
      : money(Number(agreed.price_minor), agreed.currency ?? null, locale);
  const included = Object.entries(agreed?.includes ?? {})
    .filter(([, value]) => value === 'yes')
    .map(([key]) => key)
    .join(', ');
  const terms = [
    price,
    included === '' ? null : t({ id: 'drivers.offline.included', message: `${included} included` }),
  ]
    .filter((part): part is string => part !== null)
    .join(', ');
  const wa = phone === null ? null : whatsappLink(phone, '');
  return (
    <Stack gap="12" testID="drivers-ride-back">
      <Text variant="h2" accessibilityRole="header">
        {upper(t({ id: 'drivers.offline.title', message: 'Your ride back' }), locale)}
      </Text>
      <View style={styles.card}>
        <Stack gap="12">
          <Row gap="12" align="center">
            <Avatar name={name} joinIndex={2} size="lg" />
            <Stack gap="2" style={{ flex: 1 }}>
              <Text variant="title">
                {upper(today.window_end === null ? name : `${name} · ${today.window_end}`, locale)}
              </Text>
              {vehicle === null ? null : (
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {[vehicle.model, vehicle.plate].filter(Boolean).join(' · ')}
                </Text>
              )}
            </Stack>
          </Row>
          {today.pickup === null ? null : (
            <Row gap="8" align="center">
              <Icon name="pin" size={18} color={theme.color.yellow} decorative />
              <Text variant="bodySm">{today.pickup}</Text>
            </Row>
          )}
          <Row gap="8">
            <View style={{ flex: 1 }}>
              <PillButton
                label={t({ id: 'drivers.offline.call', message: 'Call' })}
                tone="green"
                size="sm"
                block
                disabled={phone === null}
                onPress={() => {
                  if (phone !== null) void Linking.openURL(telLink(phone));
                }}
                testID="drivers-ride-back-call"
              />
            </View>
            <View style={{ flex: 1 }}>
              <PillButton
                label={
                  online
                    ? t({ id: 'drivers.offline.whatsapp', message: 'WhatsApp' })
                    : t({ id: 'drivers.offline.whatsappLater', message: 'WhatsApp · later' })
                }
                variant="secondary"
                size="sm"
                block
                disabled={wa === null}
                onPress={() => {
                  if (wa !== null) void Linking.openURL(wa);
                }}
                testID="drivers-ride-back-whatsapp"
              />
            </View>
          </Row>
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {t({
              id: 'drivers.offline.note',
              message: 'Calls use signal, not data. The message sends when you’re back online.',
            })}
          </Text>
        </Stack>
      </View>
      <Text variant="eyebrow" color={theme.semantic.text.secondary}>
        {upper(t({ id: 'drivers.offline.saved', message: 'Saved on your phone' }), locale)}
      </Text>
      <View style={styles.saved}>
        <Stack gap="10">
          <Text variant="rowTitle">
            {t({ id: 'drivers.offline.savedNumber', message: `${name}’s number, car and plate` })}
          </Text>
          <Text variant="rowTitle">
            {t({ id: 'drivers.offline.savedPickups', message: 'Today’s pickups and pins' })}
          </Text>
          {terms === '' ? null : (
            <Stack gap="2">
              <Text variant="rowTitle">
                {t({ id: 'drivers.offline.savedTerms', message: 'What you agreed' })}
              </Text>
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {terms}
              </Text>
            </Stack>
          )}
        </Stack>
      </View>
    </Stack>
  );
}
