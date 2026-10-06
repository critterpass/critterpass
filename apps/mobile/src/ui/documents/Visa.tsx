import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { Holo } from '../textures/holo';
import { makeStyles, useTheme } from '../theme';
import { DocField } from './DocField';

export interface VisaProps {
  /** `passPlus` is the yellow visa with holo seal; `boost` the pink trip entry stamp. */
  readonly kind: 'passPlus' | 'boost';
  /** "Visa · For you · Pour vous" / "Entry · For the crew". */
  readonly eyebrow: string;
  /** "Pass+" / "Trip boost · $12". */
  readonly title: string;
  /** "$29.99" with its period line ("A year · $2.50/mo"). */
  readonly price?: string;
  readonly period?: string;
  readonly photo?: ReactNode;
  readonly fields?: readonly {
    readonly key: string;
    readonly label: string;
    readonly value: string;
  }[];
  /** Server-driven perk line. */
  readonly perk: string;
  /** Decorative MRZ line; hidden from screen readers. */
  readonly mrz?: string;
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

const SEAL = 44;
const VISA_TILT_DEG = -1.5;
const BOOST_TILT_DEG = -3;

const useStyles = makeStyles((t) => ({
  visa: {
    borderRadius: t.radius.md,
    borderWidth: 2.5,
    borderColor: t.color.ink[850],
    padding: t.space['12'],
    gap: t.space['10'],
    transform: [{ rotate: `${VISA_TILT_DEG}deg` }],
  },
  boost: {
    alignSelf: 'flex-start',
    flexShrink: 1,
    borderRadius: t.radius.sm,
    borderWidth: 3,
    padding: t.space['4'],
    transform: [{ rotate: `${BOOST_TILT_DEG}deg` }],
  },
  boostInner: {
    borderRadius: t.radius.xs,
    borderWidth: 1.5,
    padding: t.space['10'],
    gap: t.space['4'],
  },
  photo: {
    width: 60,
    height: 72,
    borderRadius: t.radius.xs,
    borderWidth: 2,
    borderColor: t.color.ink[850],
    backgroundColor: t.color.paper.bright,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seal: {
    position: 'absolute',
    end: t.space['12'],
    bottom: t.space['24'],
    width: SEAL,
    height: SEAL,
    borderRadius: SEAL / 2,
    overflow: 'hidden',
  },
}));

/** The Pass+ visa (4e-1) and the Boost entry stamp, printed on visa pages. One a11y element each. */
export function Visa({
  kind,
  eyebrow,
  title,
  price,
  period,
  photo,
  fields = [],
  perk,
  mrz,
  accessibilityLabel,
  testID,
}: VisaProps) {
  const styles = useStyles();
  const theme = useTheme();
  if (kind === 'boost') {
    const ink = theme.semantic.brand.boost;
    return (
      <View
        testID={testID}
        style={[styles.boost, { borderColor: ink }]}
        accessible
        accessibilityRole="summary"
        accessibilityLabel={accessibilityLabel}
      >
        <View style={[styles.boostInner, { borderColor: ink }]}>
          <Text variant="label" color={ink}>
            {eyebrow}
          </Text>
          <Text variant="h2" color={ink} numberOfLines={1} adjustsFontSizeToFit>
            {title}
          </Text>
          <Text variant="bodySm" color={ink}>
            {perk}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View
      testID={testID}
      style={[styles.visa, { backgroundColor: theme.semantic.brand.passplus }]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel}
    >
      <SurfaceToneProvider value="accent">
        <Row justify="space-between" align="flex-start">
          <Stack gap="2" flex={1}>
            <Text variant="monoData">{eyebrow}</Text>
            <Text variant="h1">{title}</Text>
          </Stack>
          {price ? (
            <Stack align="flex-end">
              <Text variant="h2">{price}</Text>
              {period ? <Text variant="label">{period}</Text> : null}
            </Stack>
          ) : null}
        </Row>
        <Row gap="12">
          {photo ? <View style={styles.photo}>{photo}</View> : null}
          <Row wrap gap="8" flex={1}>
            {fields.map((field) => (
              <View key={field.key} style={{ width: '45%' }}>
                <DocField label={field.label} value={field.value} />
              </View>
            ))}
          </Row>
        </Row>
        <Text variant="bodySm" style={{ paddingEnd: SEAL + 8 }}>
          {perk}
        </Text>
        <View style={styles.seal}>
          <Holo />
        </View>
        {mrz ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text variant="monoData" numberOfLines={1} ellipsizeMode="clip">
              {mrz}
            </Text>
          </View>
        ) : null}
      </SurfaceToneProvider>
    </View>
  );
}
