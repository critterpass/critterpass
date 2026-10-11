/**
 * The flight as a real boarding card (7.10, 7.12): the airline tile, "SQ 938 · Mon 12 Oct" and the
 * live status, the two airports large with the times under them, a perforation with notches, and
 * the stub (terminal, gate, boards, seat; the seat is the reader's own, so it wears a lock). A
 * cancelled flight strikes the route in pink. It is drawn light in both modes (1.13): the caller
 * pins the light theme around it.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { premium } from '@cp/design-tokens';
import { Icon, StatusTag, Text, usePremiumTheme, type StatusTone } from '@/ui/premium';

import type { FlightChip, FlightView } from '../../flight-card/flight-model';

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
        <View>
          <Text variant="display" style={struck}>
            {view.from}
          </Text>
          <Text variant="headline" style={styles.tabular}>
            {props.departs}
          </Text>
        </View>
        <Text variant="title" tone="placeholder" accessibilityElementsHidden>
          ✈︎
        </Text>
        <View style={styles.end}>
          <Text variant="display" style={struck}>
            {view.to}
          </Text>
          <Text variant="headline" style={styles.tabular}>
            {props.arrives}
          </Text>
        </View>
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
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  end: { alignItems: 'flex-end' },
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
