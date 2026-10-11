/**
 * "Saved on this phone" (7.10): the boarding pass (or voucher code) and each document the offline
 * bundle saved, with "Works offline" beside the label. A document not saved yet says it saves when
 * the phone is back on signal, and does nothing until then.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { IconTile } from '@/features/trip';
import { Icon, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import type { BookingDetail } from '../../detail/use-booking-detail';

type Ready = Extract<BookingDetail, { kind: 'ready' }>;

function DocRow(props: {
  readonly title: string;
  readonly sub: string;
  readonly saved: boolean;
  readonly pass?: boolean;
  readonly first: boolean;
  readonly onPress: (() => void) | null;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  return (
    <PressableScale
      {...(props.onPress === null ? {} : { onPress: props.onPress })}
      disabled={props.onPress === null}
      pressedScale={0.99}
      accessibilityRole="button"
      accessibilityLabel={`${props.title}, ${props.sub}`}
      testID={props.testID}
    >
      <View
        style={[
          styles.row,
          props.first ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
        ]}
      >
        <IconTile
          name={props.pass === true ? 'qr' : 'receipt'}
          bg={props.pass === true ? th.color.ink : th.color.control}
          color={props.pass === true ? th.color.onInk : th.color.muted}
          size={42}
        />
        <View style={styles.text}>
          <Text variant="rowTitle" numberOfLines={1}>
            {props.title}
          </Text>
          <Text
            variant="captionMuted"
            {...(props.saved
              ? { tone: 'muted' as const }
              : { color: th.color.status.tangerine.text })}
            numberOfLines={1}
          >
            {props.sub}
          </Text>
        </View>
        {props.saved ? (
          <View style={[styles.check, { backgroundColor: th.color.toggleOn }]}>
            <Icon name="check" size={14} color={th.accent.paper} />
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

export function DocsCard({ detail }: { readonly detail: Ready }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { booking } = detail;
  if (!detail.hasPass && detail.docs.length === 0) return null;
  const flight = booking.kind === 'flight';
  return (
    <View style={{ gap: th.space.gap8 }} testID="bookings-docs">
      <View style={[styles.head, { paddingHorizontal: th.space.titleGutter + 2 }]}>
        <Text variant="label" tone="muted">
          {t({ id: 'bookings.premium.savedHere', message: 'Saved on this phone' })}
        </Text>
        <Text variant="helper" color={th.color.status.booked.text}>
          {t({ id: 'bookings.premium.worksOffline', message: 'Works offline' })}
        </Text>
      </View>
      <View
        style={[
          styles.card,
          {
            marginHorizontal: th.space.gutter,
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        {detail.hasPass ? (
          <DocRow
            title={
              flight
                ? t({ id: 'bookings.detail.pass', message: 'Boarding pass' })
                : t({ id: 'bookings.detail.voucher', message: 'Voucher code' })
            }
            sub={
              detail.view?.seat == null
                ? t({ id: 'bookings.premium.opensOffline', message: 'Opens with no signal' })
                : t({ id: 'bookings.premium.seat', message: `Seat ${detail.view.seat}` })
            }
            saved
            pass
            first
            onPress={detail.onPass}
            testID="bookings-doc-pass"
          />
        ) : null}
        {detail.docs.map((doc, index) => (
          <DocRow
            key={doc.id}
            title={doc.label}
            sub={
              doc.uri === null
                ? t({
                    id: 'bookings.premium.docPending',
                    message: "Saves when you're back on Wi-Fi",
                  })
                : t({ id: 'bookings.premium.docSaved', message: 'Saved' })
            }
            saved={doc.uri !== null}
            first={!detail.hasPass && index === 0}
            onPress={doc.uri === null ? null : () => detail.onDoc(doc)}
            testID={`bookings-doc-${doc.id}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  card: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 62,
    paddingLeft: 10,
    paddingRight: 14,
  },
  text: { flex: 1, minWidth: 0 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
