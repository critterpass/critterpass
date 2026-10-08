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
import { InfoPill } from '@/ui/chips/InfoPill';
import { DocField } from '@/ui/documents/DocField';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { Barcode } from '@/ui/textures/barcode';
import { makeStyles, useTheme } from '@/ui/theme';

import { clock, dayDate } from '../format';
import { awaitsBoarding, needsAttention, type FlightView } from './flight-model';
import { useChipLabel, useCoTravellerLine, useSourceLine } from './labels';
import { useWalletGuide } from '../data/wallet-guide';

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
  struck: { textDecorationLine: 'line-through' },
  // A cancelled flight's times and gate no longer hold: they stay readable, but step back.
  off: { opacity: t.opacity.pending },
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
  const { name: guideName } = useWalletGuide();
  const chipLabel = useChipLabel();
  const crewLine = useCoTravellerLine();
  const sourceLine = useSourceLine();
  const ink = theme.semantic.text.onAccent;
  const boards = clock(locale, view.boardsAt, tz);
  const cells = [
    {
      key: 'boards',
      label: t({ id: 'bookings.flight.boards', message: 'Boards' }),
      // An estimate is marked with a tilde: a word beside the time does not fit the column in
      // every language.
      value: boards === '' ? '—' : view.boardingEstimated ? `~${boards}` : boards,
    },
    { key: 'gate', label: t({ id: 'bookings.flight.gate', message: 'Gate' }), value: view.gate },
    { key: 'seat', label: t({ id: 'bookings.flight.seat', message: 'Seat' }), value: view.seat },
    { key: 'bag', label: t({ id: 'bookings.flight.bag', message: 'Bag' }), value: view.bag },
  ];
  const lines = [
    crewLine(coTravellers),
    mine && awaitsBoarding(view.chip)
      ? t({ id: 'bookings.flight.ping', message: `${guideName} pings you when boarding opens.` })
      : null,
    mine && !hasPass
      ? t({
          id: 'bookings.flight.noPass',
          message: 'No boarding pass in this email — scan it at check-in.',
        })
      : null,
  ].filter((line): line is string => line !== null && line !== '');
  const status = chipLabel(view.chip, view.delayMin);
  const alert = needsAttention(view.chip);
  const cancelled = view.chip === 'cancelled';
  const was = clock(locale, view.wasDepartingAt, tz);
  return (
    <Stack gap="14" testID={testID}>
      <Row justify="space-between" align="center" gap="8">
        <Text variant="label" numberOfLines={1} style={styles.code}>
          {upper(`${view.number} · ${dayDate(locale, view.departsAt, tz)}`, locale)}
        </Text>
        {alert ? (
          <InfoPill nowrap {...(testID === undefined ? {} : { testID: `${testID}-status` })}>
            {upper(status, locale)}
          </InfoPill>
        ) : (
          <Text variant="label" testID={testID === undefined ? undefined : `${testID}-status`}>
            {upper(status, locale)}
          </Text>
        )}
      </Row>
      <Row justify="space-between" align="center" gap="8" style={cancelled ? styles.off : null}>
        <Stack style={styles.code}>
          <Text variant="displayHero">{view.from}</Text>
          <Row gap="6" align="center">
            <Text variant="body" style={cancelled ? styles.struck : null}>
              {clock(locale, view.departsAt, tz)}
            </Text>
            {was === '' || cancelled ? null : (
              <Text
                variant="bodySm"
                style={styles.struck}
                testID={testID === undefined ? undefined : `${testID}-was`}
              >
                {was}
              </Text>
            )}
          </Row>
        </Stack>
        <Icon name="plane" size={40} color={ink} decorative />
        <Stack align="flex-end" style={styles.code}>
          <Text variant="displayHero">{view.to}</Text>
          <Text variant="body" style={cancelled ? styles.struck : null}>
            {clock(locale, view.arrivesAt, tz)}
          </Text>
        </Stack>
      </Row>
      <Row gap="8" align="flex-start" style={cancelled ? styles.off : null}>
        {cells.map((cell) => (
          <View key={cell.key} style={styles.cell}>
            {cell.key === 'gate' && view.chip === 'gate_change' && cell.value != null ? (
              <Stack gap="2">
                <Text variant="monoData" color={ink}>
                  {upper(cell.label, locale)}
                </Text>
                <InfoPill nowrap>{upper(cell.value, locale)}</InfoPill>
              </Stack>
            ) : (
              <DocField
                label={upper(cell.label, locale)}
                value={upper(cell.value ?? '—', locale)}
              />
            )}
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
