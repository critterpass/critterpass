import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { CardTone } from '../cards/tone';
import { cardBackground, surfaceToneOf } from '../cards/tone';
import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { Barcode } from '../textures/barcode';
import { Halftone } from '../textures/halftone';
import { makeStyles, useTheme } from '../theme';
import { DocField } from './DocField';

export interface TicketEndpoint {
  /** IATA or place code ("SIN", "KIX"). */
  readonly code: string;
  readonly time?: string;
}

export interface TicketProps {
  /** `flight` (booked flight), `crew` (the trip boarding pass, 3f-5) or `boost` (trip boost). */
  readonly kind?: 'flight' | 'crew' | 'boost';
  /** Card colour; defaults per kind (crew yellow, flight blue, boost pink). */
  readonly tone?: CardTone;
  readonly headStart: string;
  readonly headEnd?: string;
  readonly from: TicketEndpoint;
  readonly to: TicketEndpoint;
  readonly fields: readonly {
    readonly key: string;
    readonly label: string;
    readonly value: string;
  }[];
  /** Guide sticker in the lower end corner of the main part. */
  readonly sticker?: ReactNode;
  /** Stub line under the barcode ("Boarding group: The Bali Six"). */
  readonly stubText: string;
  readonly stubEnd?: string;
  /** The whole ticket read as one element. */
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

const NOTCH = 22;
const DEFAULT_TONE: Record<NonNullable<TicketProps['kind']>, CardTone> = {
  crew: 'yellow',
  flight: 'blue',
  boost: 'pink',
};

const useStyles = makeStyles((t) => ({
  main: {
    borderTopLeftRadius: t.radius.cardBig,
    borderTopRightRadius: t.radius.cardBig,
    borderBottomLeftRadius: t.radius.ticketStub[0],
    borderBottomRightRadius: t.radius.ticketStub[0],
    padding: t.size.cardInner.max,
    overflow: 'hidden',
    gap: t.space['12'],
  },
  stub: {
    borderTopLeftRadius: t.radius.ticketStub[0],
    borderTopRightRadius: t.radius.ticketStub[0],
    borderBottomLeftRadius: t.radius.cardBig,
    borderBottomRightRadius: t.radius.cardBig,
    padding: t.size.cardInner.max,
    gap: t.space['10'],
  },
  tear: { height: 0, borderTopWidth: 2, borderStyle: 'dashed', marginHorizontal: NOTCH },
  notch: {
    position: 'absolute',
    top: -NOTCH / 2,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
  },
  barcode: { height: 44 },
  fields: { flex: 1, minWidth: 0 },
  sticker: { flexShrink: 0 },
  code: { flexShrink: 1 },
}));

/** A ticket with notch and tear line: codes, fields, guide sticker, barcode stub. One a11y element. */
export function Ticket({
  kind = 'crew',
  tone,
  headStart,
  headEnd,
  from,
  to,
  fields,
  sticker,
  stubText,
  stubEnd,
  accessibilityLabel,
  testID,
}: TicketProps) {
  const styles = useStyles();
  const theme = useTheme();
  const fill = cardBackground(theme, tone ?? DEFAULT_TONE[kind]);
  const surface = surfaceToneOf(tone ?? DEFAULT_TONE[kind]);
  const ink = theme.semantic.text.onAccent;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel}
    >
      <SurfaceToneProvider value={surface}>
        <View style={[styles.main, { backgroundColor: fill }]}>
          <Halftone />
          <Row justify="space-between">
            <Text variant="label">{headStart}</Text>
            {headEnd ? <Text variant="label">{headEnd}</Text> : null}
          </Row>
          <Row justify="space-between" align="center" gap="8">
            <Stack style={styles.code}>
              <Text variant="displayHero">{from.code}</Text>
              {from.time ? <Text variant="monoData">{from.time}</Text> : null}
            </Stack>
            <Icon name="plane" size={36} color={ink} decorative />
            <Stack align="flex-end" style={styles.code}>
              <Text variant="displayHero">{to.code}</Text>
              {to.time ? <Text variant="monoData">{to.time}</Text> : null}
            </Stack>
          </Row>
          {/* The sticker keeps its size at the end of the fields' row, which lay out in the width
              left beside it, so a long value ("WINDOW, BY MAYA") wraps instead of running under it. */}
          <Row align="flex-end" gap="8">
            <Row wrap gap="12" style={styles.fields}>
              {fields.map((field) => (
                <View key={field.key} style={{ width: '45%' }}>
                  <DocField label={field.label} value={field.value} wrap />
                </View>
              ))}
            </Row>
            {sticker ? (
              <View style={styles.sticker} testID={testID ? `${testID}-sticker` : undefined}>
                {sticker}
              </View>
            ) : null}
          </Row>
        </View>
        <View style={{ backgroundColor: fill }}>
          <View style={[styles.tear, { borderColor: theme.semantic.bg.base }]} />
          <View
            style={[styles.notch, { start: -NOTCH / 2, backgroundColor: theme.semantic.bg.base }]}
          />
          <View
            style={[styles.notch, { end: -NOTCH / 2, backgroundColor: theme.semantic.bg.base }]}
          />
        </View>
        <View style={[styles.stub, { backgroundColor: fill }]}>
          <View style={styles.barcode}>
            <Barcode />
          </View>
          <Row justify="space-between">
            <Text variant="label">{stubText}</Text>
            {stubEnd ? <Text variant="label">{stubEnd}</Text> : null}
          </Row>
        </View>
      </SurfaceToneProvider>
    </View>
  );
}
