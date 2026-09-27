import { Path, Canvas } from '@shopify/react-native-skia';
import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { Barcode } from '../textures/barcode';
import { makeStyles, useTheme } from '../theme';
import { paperColours } from './paper-colours';

export interface ReceiptLine {
  readonly key: string;
  readonly label: string;
  readonly amount: string;
  /** Totals print bold. */
  readonly emphasis?: boolean;
  /** Lines the scanner read (OCR), marked with the highlighter. */
  readonly highlight?: boolean;
}

export interface ReceiptProps {
  readonly art?: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  /** Sections separated by dashed rules. */
  readonly sections: readonly (readonly ReceiptLine[])[];
  /** A handwritten line in a guide/voice colour ("Everyone's square."). */
  readonly note?: string;
  readonly noteColor?: string;
  /** A stamp (`Stamp`) over the top end corner ("Paid in full"). */
  readonly stamp?: ReactNode;
  readonly barcode?: boolean;
  readonly footer?: string;
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

const TOOTH = 10;

/* eslint-disable lingui/no-unlocalized-strings -- SVG path commands, never rendered copy. */
export function zigzagPath(width: number, tooth = TOOTH): string {
  const teeth = Math.max(1, Math.round(width / tooth));
  const step = width / teeth;
  let d = `M0 0H${width}V0`;
  for (let i = teeth; i > 0; i--) d += `L${(i - 0.5) * step} ${tooth / 2}L${(i - 1) * step} 0`;
  return `${d}Z`;
}
/* eslint-enable lingui/no-unlocalized-strings */

const useStyles = makeStyles((t) => ({
  paper: { backgroundColor: t.color.paper.bright, padding: t.space['16'], gap: t.space['10'] },
  rule: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: paperColours(t).receiptRule },
  highlight: {
    backgroundColor: t.color.yellow,
    marginHorizontal: -t.space['4'],
    paddingHorizontal: t.space['4'],
  },
  stamp: { position: 'absolute', top: t.space['8'], end: -t.space['8'] },
  barcode: { height: 40 },
}));

/** A printed receipt: header, dashed sections, highlighted OCR lines, note, barcode, zig-zag foot. */
export function Receipt({
  art,
  title,
  subtitle,
  sections,
  note,
  noteColor,
  stamp,
  barcode = true,
  footer,
  accessibilityLabel,
  testID,
}: ReceiptProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return (
    <View
      testID={testID}
      onLayout={onLayout}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel}
    >
      <SurfaceToneProvider value="paper">
        <Stack style={styles.paper}>
          <Stack align="center" gap="4">
            {art}
            <Text variant="h3">{title}</Text>
            {subtitle ? <Text variant="monoData">{subtitle}</Text> : null}
          </Stack>
          {sections.map((lines, index) => (
            <Fragment key={index}>
              <View style={styles.rule} />
              <Stack gap="6">
                {lines.map((line) => (
                  <Row
                    key={line.key}
                    justify="space-between"
                    gap="8"
                    style={line.highlight ? styles.highlight : undefined}
                  >
                    <Text variant={line.emphasis ? 'title' : 'monoData'}>{line.label}</Text>
                    <Text variant={line.emphasis ? 'title' : 'monoData'}>{line.amount}</Text>
                  </Row>
                ))}
              </Stack>
            </Fragment>
          ))}
          {note ? (
            <Text
              variant="voice"
              color={noteColor ?? theme.color.rust.darkened}
              style={{ textAlign: 'center' }}
            >
              {note}
            </Text>
          ) : null}
          {barcode ? (
            <View style={styles.barcode}>
              <Barcode />
            </View>
          ) : null}
          {footer ? (
            <Text variant="monoData" style={{ textAlign: 'center' }}>
              {footer}
            </Text>
          ) : null}
        </Stack>
        {width > 0 ? (
          <Canvas style={{ width, height: TOOTH / 2 }}>
            <Path path={zigzagPath(width)} color={theme.color.paper.bright} />
          </Canvas>
        ) : null}
        {stamp ? <View style={styles.stamp}>{stamp}</View> : null}
      </SurfaceToneProvider>
    </View>
  );
}
