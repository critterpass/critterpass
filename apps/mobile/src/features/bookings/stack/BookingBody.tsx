/**
 * The open card of a stay, activity, boat, transfer, rail or car hire booking (the design shows
 * only a flight open; this uses the flight card's type scale): the doodle, title and when, where,
 * the confirmation code, the free-cancellation deadline and, for the owner's own voucher, the
 * code tile that opens it full screen.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PrivateContent } from '@/features/help';
import { useLocale } from '@/lib/i18n/use-locale';
import { DocField } from '@/ui/documents/DocField';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { Barcode } from '@/ui/textures/barcode';
import { makeStyles, useTheme } from '@/ui/theme';

import type { WalletBooking } from '../data/model';
import { clock, dateTime, dayDate } from '../format';
import { useDeckMeta } from './deck-meta';

const TILE = 64;

const useStyles = makeStyles((t) => ({
  title: { flex: 1 },
  cell: { flex: 1, minWidth: 0 },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: t.radius.sm,
    padding: t.space['6'],
    backgroundColor: t.color.paper.base,
  },
  bars: { flex: 1 },
}));

export interface BookingBodyProps {
  readonly booking: WalletBooking;
  readonly tz?: string | undefined;
  readonly hasPass: boolean;
  readonly onPass: () => void;
  readonly testID?: string;
}

export function BookingBody({ booking, tz, hasPass, onPass, testID }: BookingBodyProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const meta = useDeckMeta();
  const when = [dayDate(locale, booking.startsAt, tz), clock(locale, booking.startsAt, tz)]
    .filter((part) => part !== '')
    .join(' · ');
  const fields = [
    { key: 'when', label: t({ id: 'bookings.card.when', message: 'When' }), value: when },
    {
      key: 'ref',
      label: t({ id: 'bookings.card.ref', message: 'Ref' }),
      value: booking.supplierRef ?? '',
    },
  ].filter((field) => field.value !== '');
  const place = booking.details.meeting_point ?? booking.location;
  const deadline = booking.freeCancelUntil;
  return (
    <Stack gap="12" testID={testID}>
      <Row gap="8" align="center">
        <Icon name={booking.icon} size={28} color={theme.semantic.text.onAccent} decorative />
        <Text variant="h3" style={styles.title} numberOfLines={2}>
          {upper(booking.title, locale)}
        </Text>
        <Text variant="label">{meta(booking, tz)}</Text>
      </Row>
      {fields.length === 0 ? null : (
        <PrivateContent>
          <Row gap="12">
            {fields.map((field) => (
              <View key={field.key} style={styles.cell}>
                <DocField label={upper(field.label, locale)} value={field.value} wrap />
              </View>
            ))}
          </Row>
        </PrivateContent>
      )}
      {place === null || place === undefined || place === '' ? null : (
        <Text variant="body">{place}</Text>
      )}
      {deadline === null ? null : (
        <Text variant="bodySm" testID={testID === undefined ? undefined : `${testID}-deadline`}>
          {t({
            id: 'bookings.card.freeCancel',
            message: `Free cancellation until ${dateTime(locale, deadline, tz)}`,
          })}
        </Text>
      )}
      {booking.mine && booking.hasBarcode && hasPass ? (
        <PressScale
          onPress={onPass}
          widthClass="narrow"
          accessibilityLabel={t({
            id: 'bookings.card.voucherA11y',
            message: 'Voucher code, open full screen',
          })}
          style={styles.tile}
          testID={testID === undefined ? undefined : `${testID}-pass`}
        >
          <PrivateContent style={styles.bars}>
            <Barcode color={theme.color.paper.ink} />
          </PrivateContent>
        </PressScale>
      ) : null}
    </Stack>
  );
}
