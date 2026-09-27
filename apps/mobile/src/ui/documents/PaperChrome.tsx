import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { Engraving } from '../textures/engraving';
import { Guilloche } from '../textures/guilloche';
import { makeStyles } from '../theme';
import { paperColours } from './paper-colours';

export interface PaperChromeProps {
  /** Top-start running head ("Critterpass · Passeport", "Visas · Visas · Visas"). */
  readonly headStart?: string;
  /** Top-end running head ("CP-0427", "Page 07"). */
  readonly headEnd?: string;
  /** Machine-readable-zone lines along the foot; decorative and hidden from screen readers. */
  readonly mrz?: readonly string[];
  /** `guilloche` for passport pages, `engraving` for visas. @default 'guilloche' */
  readonly texture?: 'guilloche' | 'engraving';
  /** One label read for the whole document (composites are grouped). */
  readonly accessibilityLabel: string;
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  paper: {
    backgroundColor: t.color.paper.base,
    borderRadius: t.radius.lg,
    padding: t.size.cardInner.max,
    overflow: 'hidden',
    shadowColor: t.shadow.paper.color,
    shadowOffset: { width: t.shadow.paper.offsetX, height: t.shadow.paper.offsetY },
    shadowRadius: t.shadow.paper.blur / 2,
    shadowOpacity: 1,
    elevation: 3,
  },
  mrz: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: paperColours(t).border,
    paddingTop: t.space['8'],
  },
}));

/** Official paper: guilloche or engraving, running heads and a decorative MRZ foot, read as one. */
export function PaperChrome({
  headStart,
  headEnd,
  mrz,
  texture = 'guilloche',
  accessibilityLabel,
  children,
  style,
  testID,
}: PaperChromeProps) {
  const styles = useStyles();
  return (
    <View
      testID={testID}
      style={[styles.paper, style]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel}
    >
      <SurfaceToneProvider value="paper">
        {texture === 'guilloche' ? <Guilloche /> : <Engraving />}
        <Stack gap="12">
          {headStart || headEnd ? (
            <Row justify="space-between" gap="8">
              <Text variant="monoData">{headStart ?? ''}</Text>
              <Text variant="monoData">{headEnd ?? ''}</Text>
            </Row>
          ) : null}
          {children}
          {mrz && mrz.length > 0 ? (
            <View
              style={styles.mrz}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {mrz.map((line) => (
                <Text key={line} variant="monoData" numberOfLines={1}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
        </Stack>
      </SurfaceToneProvider>
    </View>
  );
}
