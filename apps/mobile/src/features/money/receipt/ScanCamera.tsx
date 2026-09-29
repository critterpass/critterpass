/**
 * The full-bleed scan stage (3i-3, 3i-4): the dark striped camera field, ✕ and the status chip
 * (AUTO-SPLIT ON, or the quality problem in pink), the receipt photo under the scan sweep, and a
 * bottom panel for whatever comes next. The platform document scanner does the live capture (its
 * own auto-capture on a flat, steady page); this stage shows the photo it took.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/ui/buttons/IconButton';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { Hatch } from '@/ui/textures/hatch';
import { makeStyles, useTheme } from '@/ui/theme';

import { ScanSweep, type SweepLine } from './ScanSweep';

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.color.ink['930'] },
  top: {
    position: 'absolute',
    start: t.size.gutter,
    end: t.size.gutter,
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.space['32'],
  },
  chip: {
    borderRadius: t.space['20'],
    paddingHorizontal: t.space['14'],
    paddingVertical: t.space['8'],
  },
  photo: { width: '100%' },
}));

export interface ScanCameraProps {
  readonly chip: { readonly label: string; readonly tone: 'green' | 'pink' } | null;
  readonly onChip?: (() => void) | undefined;
  readonly onClose: () => void;
  /** The receipt photo (or nothing yet while aiming). */
  readonly photo: ReactNode | null;
  readonly lines: readonly SweepLine[];
  readonly sweeping: boolean;
  readonly stutter?: boolean;
  /** Shown in the stage when there is no photo yet (the aim hint, the denied card). */
  readonly empty?: ReactNode;
  readonly panel: ReactNode;
  readonly testID?: string;
}

export function ScanCamera(props: ScanCameraProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const chipColour =
    props.chip?.tone === 'pink' ? theme.semantic.state.urgent : theme.semantic.state.success;
  return (
    <View style={styles.root} testID={props.testID}>
      <Hatch baseColor={theme.color.ink['930']} />
      <Row style={[styles.top, { top: insets.top + theme.space['8'] }]}>
        <IconButton
          label={t({ id: 'money.scan.close', message: 'Close the scan' })}
          glyph={<Text variant="h3">✕</Text>}
          surface="onPhoto"
          onPress={props.onClose}
          testID="money-scan-close"
        />
        {props.chip === null ? null : (
          <Pressable
            onPress={props.onChip}
            disabled={props.onChip === undefined}
            accessibilityRole={props.onChip === undefined ? 'text' : 'switch'}
            style={[styles.chip, { backgroundColor: chipColour }]}
            testID="money-scan-chip"
          >
            <Text variant="label" color={theme.semantic.text.onAccent}>
              {props.chip.label}
            </Text>
          </Pressable>
        )}
      </Row>
      <View
        style={[styles.stage, { paddingTop: insets.top + theme.space['32'] + theme.space['16'] }]}
      >
        {props.photo === null ? (
          props.empty
        ) : (
          <ScanSweep
            lines={props.lines}
            sweeping={props.sweeping}
            stutter={props.stutter ?? false}
            testID="money-scan-photo"
          >
            <View style={styles.photo}>{props.photo}</View>
          </ScanSweep>
        )}
      </View>
      {props.panel}
    </View>
  );
}
