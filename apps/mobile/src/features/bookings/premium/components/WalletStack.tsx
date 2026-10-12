/**
 * The bookings as a wallet stack (7.02): the next booking in front, and the next few behind it as
 * closed cards whose headers peek out 44 apart, each a little narrower than the one in front of it
 * (thumb, title, when and the kind's dot). A header brings its booking to the front; the front card
 * opens it. A flight in front is its boarding card (light in both modes, 1.13); anything else is a
 * white card with its kind, title and when, and the barcode band when it has a pass.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { IconTile, turn } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { PremiumThemeProvider, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import type { WalletBooking } from '../../data/model';
import { useChipLabel } from '../../flight-card/labels';
import { flightView } from '../../flight-card/flight-model';
import { clock, dayDate } from '../../format';
import { FlightTicket } from './FlightTicket';
import { kindLook } from './kind-look';

/** How many closed headers peek above the front card; the rest are listed under the stack. */
export const STACK_DEPTH = 3;
const CLOSED_HEIGHT = 110;
const PEEK = 44;
const FRONT_INSET = 20;
const STEP_INSET = 6;
const TILTS = [-5, 4, -3];
const STRIPES = [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 3, 1, 2, 2, 1, 4, 1, 2, 1, 3, 1, 1, 2, 3, 1, 2];

function ClosedCard(props: {
  readonly booking: WalletBooking;
  readonly meta: string;
  readonly index: number;
  readonly count: number;
  readonly onPick: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const look = kindLook(props.booking.kind, th.color);
  const inset = FRONT_INSET + STEP_INSET * (props.count - 1 - props.index);
  return (
    <PressableScale
      onPress={props.onPick}
      accessibilityRole="button"
      accessibilityLabel={t({
        id: 'bookings.premium.bringToFront',
        message: `${props.booking.title}, ${props.meta}. Bring to the front`,
      })}
      testID={`bookings-closed-${props.booking.id}`}
      style={{ marginHorizontal: inset, marginBottom: PEEK - CLOSED_HEIGHT }}
    >
      <View
        style={[
          styles.closed,
          {
            borderRadius: th.radius.cardRow,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.raised,
          },
        ]}
      >
        <View style={{ transform: [turn(TILTS[props.index % TILTS.length] ?? 0)] }}>
          <IconTile name={look.icon} bg={look.bg} color={look.color} size={38} />
        </View>
        <View style={styles.flex}>
          <Text variant="rowTitle" numberOfLines={1}>
            {props.booking.title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {props.meta}
          </Text>
        </View>
        <View style={[styles.dot, { backgroundColor: look.color }]} />
      </View>
    </PressableScale>
  );
}

function BarcodeBand({ color }: { readonly color: string }) {
  return (
    <View style={styles.barcode}>
      {STRIPES.concat(STRIPES).map((width, index) => (
        <View key={index} style={{ width: width * 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

function FrontCard(props: {
  readonly booking: WalletBooking;
  readonly meta: string;
  readonly tz: string | undefined;
  readonly onOpen: () => void;
  readonly onPass: (() => void) | null;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const chipLabel = useChipLabel();
  const { booking } = props;
  const view = booking.kind === 'flight' ? flightView(booking, []) : null;
  const look = kindLook(booking.kind, th.color);
  const pass =
    props.onPass === null ? null : (
      <PressableScale
        onPress={props.onPass}
        accessibilityRole="button"
        accessibilityLabel={t({ id: 'bookings.premium.showPass', message: 'Show the pass' })}
        testID="bookings-next-up-pass"
        style={[styles.passBand, { backgroundColor: th.color.card }]}
      >
        <BarcodeBand color={th.color.ink} />
      </PressableScale>
    );
  return (
    <View testID="bookings-next-up">
      <PressableScale
        onPress={props.onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${booking.title}, ${props.meta}`}
        testID="bookings-open-details"
      >
        {view === null ? (
          <View
            style={[
              styles.front,
              {
                borderRadius: th.radius.cardLarge,
                backgroundColor: th.color.card,
                boxShadow: th.shadow.float,
              },
            ]}
          >
            <IconTile name={look.icon} bg={look.bg} color={look.color} size={48} />
            <Text variant="title" numberOfLines={2}>
              {booking.title}
            </Text>
            <Text variant="rowText" tone="muted" numberOfLines={2}>
              {[props.meta, booking.location ?? ''].filter((part) => part !== '').join(' · ')}
            </Text>
          </View>
        ) : (
          // The scannable card stays light in dark mode (1.13).
          <PremiumThemeProvider scheme="light">
            <FlightTicket
              view={view}
              day={dayDate(locale, view.departsAt, props.tz)}
              departs={clock(locale, view.departsAt, props.tz)}
              arrives={clock(locale, view.arrivesAt, props.tz)}
              boards={clock(locale, view.boardsAt, props.tz)}
              statusLabel={chipLabel(view.chip, view.delayMin)}
              notch={th.color.ground}
            />
          </PremiumThemeProvider>
        )}
      </PressableScale>
      {pass}
    </View>
  );
}

export function WalletStack(props: {
  readonly front: WalletBooking;
  /** The bookings behind it, soonest first; only the first few are drawn. */
  readonly behind: readonly WalletBooking[];
  readonly metaOf: (booking: WalletBooking) => string;
  readonly tz: string | undefined;
  readonly onPick: (id: string) => void;
  readonly onOpen: () => void;
  readonly onPass: (() => void) | null;
}) {
  const shown = props.behind.slice(0, STACK_DEPTH);
  return (
    <View style={styles.stack} testID="bookings-wallet-stack">
      {shown.map((booking, index) => (
        <ClosedCard
          key={booking.id}
          booking={booking}
          meta={props.metaOf(booking)}
          index={index}
          count={shown.length}
          onPick={() => props.onPick(booking.id)}
        />
      ))}
      <View style={{ marginHorizontal: FRONT_INSET }}>
        <FrontCard
          booking={props.front}
          meta={props.metaOf(props.front)}
          tz={props.tz}
          onOpen={props.onOpen}
          onPass={props.onPass}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { paddingTop: 4 },
  closed: {
    height: CLOSED_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  flex: { flex: 1, minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 14 },
  front: { padding: 18, gap: 8 },
  barcode: { flexDirection: 'row', height: 52, gap: 3, overflow: 'hidden' },
  passBand: { marginTop: 10, borderRadius: 10, overflow: 'hidden', padding: 6 },
});
