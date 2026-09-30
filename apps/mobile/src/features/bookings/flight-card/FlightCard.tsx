/**
 * The open flight in the stack (3h-1): `SQ 938 · MON 12 OCT` and the status, the airports with
 * their times and the plane, the BOARDS / GATE / SEAT / BAG grid, a tear line, then the barcode
 * tile (full-screen pass on tap) beside who else is on board and the boarding-ping promise. The
 * status variants beyond ON TIME, the "est." boarding time, the source line and the missing
 * boarding pass are built from the same type scale (docs/undesigned-states.md).
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { DocField } from '@/ui/documents/DocField';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { Barcode } from '@/ui/textures/barcode';
import { makeStyles, useTheme } from '@/ui/theme';

import { clock, dayDate } from '../format';
import type { FlightView } from './flight-model';
import { useChipLabel, useCoTravellerLine, useSourceLine } from './labels';

const TILE = 76;

const useStyles = makeStyles((t) => ({
  code: { flexShrink: 1 },
  cell: { flex: 1, minWidth: 0 },
  tear: {
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    marginVertical: t.space['4'],
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: t.radius.sm,
    padding: t.space['6'],
    backgroundColor: t.color.paper.base,
    overflow: 'hidden',
  },
  tileBars: { flex: 1 },
  body: { flex: 1, minWidth: 0 },
}));

export interface FlightCardProps {
  readonly view: FlightView;
  /** Time zone the times print in (the booking's, else the trip's). */
  readonly tz?: string | undefined;
  /** Names of the crewmates on board, in order. */
  readonly coTravellers: readonly string[];
  /** The owner's own pass is on the device (or a scan put one there). */
  readonly hasPass: boolean;
  readonly mine: boolean;
  readonly onPass: () => void;
  readonly testID?: string;
}

export function FlightCard({
  view,
  tz,
  coTravellers,
  hasPass,
  mine,
  onPass,
  testID,
}: FlightCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const chipLabel = useChipLabel();
  const crewLine = useCoTravellerLine();
  const sourceLine = useSourceLine();
  const ink = theme.semantic.text.onAccent;
  const boards = clock(locale, view.boardsAt, tz);
  const cells = [
    {
      key: 'boards',
      label: t({ id: 'bookings.flight.boards', message: 'Boards' }),
      value:
        boards === ''
          ? '—'
          : view.boardingEstimated
            ? t({ id: 'bookings.flight.boardsEst', message: `${boards} est.` })
            : boards,
    },
    { key: 'gate', label: t({ id: 'bookings.flight.gate', message: 'Gate' }), value: view.gate },
    { key: 'seat', label: t({ id: 'bookings.flight.seat', message: 'Seat' }), value: view.seat },
    { key: 'bag', label: t({ id: 'bookings.flight.bag', message: 'Bag' }), value: view.bag },
  ];
  const lines = [
    crewLine(coTravellers),
    mine && view.chip !== 'landed' && view.chip !== 'cancelled'
      ? t({ id: 'bookings.flight.ping', message: 'Tokek pings you when boarding opens.' })
      : null,
    mine && !hasPass
      ? t({
          id: 'bookings.flight.noPass',
          message: 'No boarding pass in this email — scan it at check-in.',
        })
      : null,
  ].filter((line): line is string => line !== null && line !== '');
  const status = chipLabel(view.chip, view.delayMin);
  return (
    <Stack gap="14" testID={testID}>
      <Row justify="space-between" align="center" gap="8">
        <Text variant="label" numberOfLines={1} style={styles.code}>
          {upper(`${view.number} · ${dayDate(locale, view.departsAt, tz)}`, locale)}
        </Text>
        <Text variant="label" testID={testID === undefined ? undefined : `${testID}-status`}>
          {upper(status, locale)}
        </Text>
      </Row>
      <Row justify="space-between" align="center" gap="8">
        <Stack style={styles.code}>
          <Text variant="displayHero">{view.from}</Text>
          <Text variant="body">{clock(locale, view.departsAt, tz)}</Text>
        </Stack>
        <Icon name="plane" size={40} color={ink} decorative />
        <Stack align="flex-end" style={styles.code}>
          <Text variant="displayHero">{view.to}</Text>
          <Text variant="body">{clock(locale, view.arrivesAt, tz)}</Text>
        </Stack>
      </Row>
      <Row gap="8">
        {cells.map((cell) => (
          <View key={cell.key} style={styles.cell}>
            <DocField label={upper(cell.label, locale)} value={upper(cell.value ?? '—', locale)} />
          </View>
        ))}
      </Row>
      <View style={[styles.tear, { borderColor: ink }]} />
      <Row gap="16" align="center">
        {mine && hasPass ? (
          <PressScale
            onPress={onPass}
            widthClass="narrow"
            accessibilityRole="button"
            accessibilityLabel={t({
              id: 'bookings.flight.passA11y',
              message: 'Boarding pass, open full screen',
            })}
            style={styles.tile}
            testID={testID === undefined ? undefined : `${testID}-pass`}
          >
            <View style={styles.tileBars}>
              <Barcode color={theme.color.paper.ink} />
            </View>
          </PressScale>
        ) : null}
        <Stack gap="4" style={styles.body}>
          {lines.map((line) => (
            <Text key={line} variant="body">
              {line}
            </Text>
          ))}
          {view.source === null ? null : (
            <Text variant="caption" testID={testID === undefined ? undefined : `${testID}-source`}>
              {sourceLine(view.source.name, clock(locale, view.source.at, tz))}
            </Text>
          )}
        </Stack>
      </Row>
    </Stack>
  );
}
