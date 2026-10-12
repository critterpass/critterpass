/**
 * The flight as a real boarding card (7.10, 7.12): the airline tile, "SQ 938 · Mon 12 Oct" and the
 * live status, the two airports large with the times under them, a perforation with notches, and
 * the stub (terminal, gate, boards, seat; the seat is the reader's own, so it wears a lock). A
 * cancelled flight strikes the route in pink. It is drawn light in both modes (1.13): the caller
 * pins the light theme around it.
 */
import { useLingui } from '@lingui/react/macro';
import { Canvas, DashPathEffect, Path } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';

import { premium } from '@cp/design-tokens';
import { turn } from '@/features/trip';
import { Icon, StatusTag, Text, usePremiumTheme, type StatusTone } from '@/ui/premium';

import type { FlightChip, FlightView } from '../../flight-card/flight-model';

/** The arc's path on its 120 × 40 canvas (the design's `M4 34 Q60 −6 116 34`). */
// eslint-disable-next-line lingui/no-unlocalized-strings -- SVG path data, never copy.
const ARC = 'M4 34 Q60 -6 116 34';

export interface FlightTicketProps {
  readonly view: FlightView;
  readonly day: string;
  readonly departs: string;
  readonly arrives: string;
  readonly boards: string;
  readonly statusLabel: string;
  /** The page's ground, for the perforation's notches. */
  readonly notch: string;
}

function toneOf(chip: FlightChip): StatusTone {
  switch (chip) {
    case 'cancelled':
    case 'diverted':
      return 'voteOpen';
    case 'delayed':
    case 'gate_change':
      return 'maybe';
    case 'scheduled':
      return 'unopened';
    case 'on_time':
    case 'boarding':
    case 'departed':
    case 'landed':
      return 'booked';
  }
}

function StubCell(props: {
  readonly label: string;
  readonly value: string;
  readonly lock?: boolean;
}) {
  const th = usePremiumTheme();
  return (
    <View style={styles.cell}>
      <View style={styles.cellHead}>
        <Text variant="badge" tone="placeholder" style={styles.caps} numberOfLines={1}>
          {props.label.toUpperCase()}
        </Text>
        {props.lock === true ? <Icon name="lock" size={9} color={th.accent.pink} /> : null}
      </View>
      <Text variant="stepperValue" style={styles.stubValue} numberOfLines={1}>
        {props.value === '' ? '–' : props.value}
      </Text>
    </View>
  );
}

/** Minutes from take-off to landing, or null when either time is missing or out of order. */
function minutesBetween(from: string, to: string | null): number | null {
  if (to === null) return null;
  const minutes = Math.round((Date.parse(to) - Date.parse(from)) / 60_000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/** The dotted arc between the airports with the plane at its top and the flight time under it. */
function FlightArc({ minutes }: { readonly minutes: number | null }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const hours = minutes === null ? 0 : Math.floor(minutes / 60);
  const rest = minutes === null ? 0 : minutes % 60;
  return (
    <View style={styles.arc} accessibilityElementsHidden importantForAccessibility="no">
      <Canvas style={styles.arcCanvas}>
        <Path path={ARC} style="stroke" strokeWidth={1.6} color={th.color.outlineEmpty}>
          <DashPathEffect intervals={[3, 4]} />
        </Path>
      </Canvas>
      <Text variant="headline" tone="ink" style={[styles.plane, { transform: [turn(8)] }]}>
        ✈︎
      </Text>
      {minutes === null ? null : (
        <Text variant="badge" tone="muted" style={styles.duration}>
          {hours === 0
            ? t({ id: 'bookings.premium.flightMinutes', message: `${rest}m` })
            : t({ id: 'bookings.premium.flightTime', message: `${hours}h ${rest}m` })}
        </Text>
      )}
    </View>
  );
}

export function FlightTicket(props: FlightTicketProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { view } = props;
  const cancelled = view.chip === 'cancelled';
  const carrier = view.number.split(' ')[0] ?? '';
  const struck = cancelled
    ? {
        opacity: 0.45,
        textDecorationLine: 'line-through' as const,
        textDecorationColor: premium.stamp.pink.ring,
      }
    : null;
  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: th.radius.cardLarge,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
        },
      ]}
      testID="bookings-flight-ticket"
    >
      <View style={styles.top}>
        <View style={[styles.airline, { backgroundColor: th.color.inkSurface }]}>
          <Text variant="badge" color={premium.accent.sun}>
            {carrier}
          </Text>
        </View>
        <Text variant="rowTextStrong" style={styles.flex} numberOfLines={1}>
          {`${view.number} · ${props.day}`}
        </Text>
        <StatusTag label={props.statusLabel} tone={toneOf(view.chip)} />
      </View>
      <View style={styles.route}>
        <Text variant="display" style={struck}>
          {view.from}
        </Text>
        <FlightArc minutes={minutesBetween(view.departsAt, view.arrivesAt)} />
        <Text variant="display" style={struck}>
          {view.to}
        </Text>
      </View>
      <View style={styles.times}>
        <Text variant="title" style={styles.tabular}>
          {props.departs}
        </Text>
        <Text variant="title" style={styles.tabular}>
          {props.arrives}
        </Text>
      </View>
      <View style={styles.perforation}>
        <View style={[styles.notch, styles.notchLeft, { backgroundColor: props.notch }]} />
        <View style={[styles.dash, { borderColor: th.color.fieldBorder }]} />
        <View style={[styles.notch, styles.notchRight, { backgroundColor: props.notch }]} />
      </View>
      <View style={styles.stub}>
        <StubCell
          label={t({ id: 'bookings.flight.terminal', message: 'Terminal' })}
          value={view.terminal ?? ''}
        />
        <StubCell
          label={t({ id: 'bookings.flight.gate', message: 'Gate' })}
          value={view.gate ?? ''}
        />
        <StubCell
          label={t({ id: 'bookings.pass.boards', message: 'Boards' })}
          value={props.boards}
        />
        <StubCell
          label={t({ id: 'bookings.flight.seat', message: 'Seat' })}
          value={view.seat ?? ''}
          lock
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 16,
    paddingHorizontal: 18,
  },
  airline: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 14,
    paddingHorizontal: 18,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  arc: { flex: 1, height: 52, alignItems: 'center' },
  arcCanvas: { width: 120, height: 40 },
  plane: { position: 'absolute', top: 0 },
  duration: { position: 'absolute', top: 30 },
  tabular: { fontVariant: ['tabular-nums'] },
  perforation: { height: 24, justifyContent: 'center' },
  dash: { borderTopWidth: 2, borderStyle: 'dashed', marginHorizontal: 20 },
  notch: { position: 'absolute', width: 24, height: 24, borderRadius: 12, top: 0 },
  notchLeft: { left: -12 },
  notchRight: { right: -12 },
  stub: { flexDirection: 'row', paddingTop: 12, paddingHorizontal: 18, paddingBottom: 16, gap: 6 },
  cell: { flex: 1 },
  cellHead: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  caps: { letterSpacing: 0.8 },
  stubValue: { marginTop: 2 },
});
