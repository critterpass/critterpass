/**
 * A booking in full (undesigned; the expense detail's type scale and settings rows): kind, title,
 * when and where, the confirmation code, travellers and price, the free-cancellation deadline
 * with the policy exactly as the confirmation words it, a flight's live status and "I landed",
 * the documents saved on the phone, who sees it, and EDIT / DELETE for its owner.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';

import { PrivateContent } from '@/features/help';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { InfoPill } from '@/ui/chips/InfoPill';
import { SettingsGroup, type SettingsRow } from '@/ui/inputs/SettingsGroup';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { WalletBooking } from '../data/model';
import { dateTime } from '../format';
import { useKindLabel } from './labels';
import { useWalletGuide } from '../data/wallet-guide';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['20'], paddingTop: t.space['8'] },
}));

export interface DetailDoc {
  readonly id: string;
  readonly label: string;
  /** Local file on the phone, null until the offline bundle saved it. */
  readonly uri: string | null;
}

export interface BookingDetailViewProps {
  readonly booking: WalletBooking;
  readonly tz?: string | undefined;
  /** "Mon 12 Oct, 09:05 → 11:40", "Oct 12 → Oct 17", already worded. */
  readonly when: string;
  readonly travellers: string;
  /** "$228 · paid by Maya". */
  readonly price: string | null;
  /** "Delayed 25m · AeroAPI · 09:12" for flights. */
  readonly status: string | null;
  readonly canReportLanded: boolean;
  readonly docs: readonly DetailDoc[];
  readonly hasPass: boolean;
  readonly onPass: () => void;
  readonly onDoc: (doc: DetailDoc) => void;
  readonly onShare: (next: boolean) => void;
  readonly onLanded: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

export function BookingDetailView(props: BookingDetailViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { name: guideName } = useWalletGuide();
  const kindLabel = useKindLabel();
  const { booking } = props;
  const secondary = theme.semantic.text.secondary;
  const flight = booking.kind === 'flight';
  const policy = booking.cancelPolicyText ?? '';
  const shared = flight ? booking.flightCrewVisible : booking.visibility === 'crew';
  const facts: SettingsRow[] = [
    { key: 'when', title: t({ id: 'bookings.detail.when', message: 'When' }), sub: props.when },
    {
      key: 'where',
      title: t({ id: 'bookings.detail.where', message: 'Where' }),
      sub: booking.location ?? '',
    },
    {
      key: 'ref',
      title: t({ id: 'bookings.detail.ref', message: 'Confirmation code' }),
      sub: booking.supplierRef ?? '',
    },
    {
      key: 'who',
      title: t({ id: 'bookings.detail.who', message: 'Travellers' }),
      sub: props.travellers,
    },
    {
      key: 'price',
      title: t({ id: 'bookings.detail.price', message: 'Price' }),
      sub: props.price ?? '',
    },
    {
      key: 'seat',
      title: t({ id: 'bookings.detail.seat', message: 'Seat' }),
      sub: booking.details.seat ?? '',
    },
    {
      key: 'room',
      title: t({ id: 'bookings.detail.room', message: 'Room' }),
      sub: booking.details.room ?? '',
    },
    {
      key: 'meet',
      title: t({ id: 'bookings.detail.meet', message: 'Meeting point' }),
      sub: booking.details.meeting_point ?? '',
    },
    {
      key: 'notes',
      title: t({ id: 'bookings.detail.notes', message: 'Notes' }),
      sub: booking.details.notes ?? '',
    },
  ]
    .filter((fact) => fact.sub !== '')
    .map((fact) => ({
      key: fact.key,
      kind: 'custom' as const,
      title: fact.title,
      subtitle: fact.sub,
      trailing: null,
    }));
  return (
    <Scaffold variant="dark" clearTabBar testID="bookings-detail">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: theme.space['32'] }]}>
        <BackEyebrow label={upper(t({ id: 'bookings.back', message: 'Bookings' }), locale)} />
        <Row gap="8" align="center">
          <InfoPill variant="outline" icon={booking.icon}>
            {upper(kindLabel(booking.kind), locale)}
          </InfoPill>
          {booking.status === 'cancelled' ? (
            <InfoPill variant="outline">
              {upper(t({ id: 'bookings.detail.cancelled', message: 'Cancelled' }), locale)}
            </InfoPill>
          ) : null}
        </Row>
        <Text variant="h1" accessibilityRole="header">
          {upper(booking.title, locale)}
        </Text>
        {props.status === null ? null : (
          <Text variant="title" testID="bookings-detail-status">
            {props.status}
          </Text>
        )}
        <PrivateContent>
          <SettingsGroup rows={facts} testID="bookings-detail-facts" />
        </PrivateContent>
        {booking.freeCancelUntil === null ? null : (
          <Stack gap="6" testID="bookings-detail-deadline">
            <Text variant="title">
              {t({
                id: 'bookings.detail.freeCancel',
                message: `Free cancellation until ${dateTime(locale, booking.freeCancelUntil, props.tz)}`,
              })}
            </Text>
            <Text variant="bodySm" color={secondary}>
              {t({
                id: 'bookings.detail.reminder',
                message: `${guideName} reminds you the day before it runs out.`,
              })}
            </Text>
            {booking.cancelPolicyText === null ? null : (
              <Text variant="bodySm" color={secondary}>
                {t({ id: 'bookings.detail.policy', message: `“${policy}”` })}
              </Text>
            )}
          </Stack>
        )}
        {props.docs.length === 0 && !props.hasPass ? null : (
          <SettingsGroup
            title={upper(t({ id: 'bookings.detail.docs', message: 'On this phone' }), locale)}
            testID="bookings-detail-docs"
            rows={[
              ...(props.hasPass
                ? [
                    {
                      key: 'pass',
                      kind: 'value' as const,
                      title: flight
                        ? t({ id: 'bookings.detail.pass', message: 'Boarding pass' })
                        : t({ id: 'bookings.detail.voucher', message: 'Voucher code' }),
                      value: '',
                      onPress: props.onPass,
                    },
                  ]
                : []),
              ...props.docs.map((doc) => ({
                key: doc.id,
                kind: 'value' as const,
                title: doc.label,
                value:
                  doc.uri === null
                    ? t({ id: 'bookings.detail.docPending', message: 'Needs signal' })
                    : '',
                onPress: () => props.onDoc(doc),
              })),
            ]}
          />
        )}
        {booking.mine ? (
          <SettingsGroup
            title={upper(t({ id: 'bookings.detail.sharing', message: 'Who sees it' }), locale)}
            rows={[
              {
                key: 'share',
                kind: 'toggle',
                title: flight
                  ? t({ id: 'bookings.detail.shareFlight', message: 'Crew sees this flight' })
                  : t({ id: 'bookings.detail.shareBooking', message: 'Shared with the crew' }),
                subtitle: flight
                  ? t({
                      id: 'bookings.detail.shareFlightSub',
                      message: 'Flight number and times only. Your seat and pass stay yours.',
                    })
                  : t({
                      id: 'bookings.detail.shareBookingSub',
                      message: 'Off keeps it in your wallet only.',
                    }),
                value: shared,
                onChange: props.onShare,
              },
            ]}
            testID="bookings-detail-sharing"
          />
        ) : null}
        {props.canReportLanded ? (
          <PillButton
            label={t({ id: 'bookings.detail.landed', message: 'I landed' })}
            onPress={props.onLanded}
            variant="secondary"
            block
            testID="bookings-detail-landed"
          />
        ) : null}
        {booking.mine ? (
          <Stack gap="8">
            <PillButton
              label={upper(t({ id: 'bookings.detail.edit', message: 'Edit' }), locale)}
              onPress={props.onEdit}
              variant="secondary"
              block
              testID="bookings-detail-edit"
            />
            <PillButton
              label={upper(t({ id: 'bookings.detail.delete', message: 'Delete' }), locale)}
              onPress={props.onDelete}
              variant="destructive"
              block
              testID="bookings-detail-delete"
            />
          </Stack>
        ) : null}
      </ScrollView>
    </Scaffold>
  );
}
