import { t } from '@lingui/core/macro';
import { Canvas, Path } from '@shopify/react-native-skia';
import { useState } from 'react';
import { View } from 'react-native';
import type { AccessibilityActionEvent, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { PillButton } from '../buttons/PillButton';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { paperColours } from './paper-colours';

export type Signature =
  | { readonly kind: 'drawn'; readonly path: string }
  | { readonly kind: 'typed'; readonly name: string };

export interface SignatureLayerProps {
  /** The signer's name: the typed alternative for anyone who cannot draw. */
  readonly name: string;
  readonly value: Signature | null;
  readonly onChange: (signature: Signature | null) => void;
  /** @default 140 */
  readonly height?: number;
  readonly testID?: string;
}

const STROKE = 3;

export function appendPoint(path: string, x: number, y: number, start: boolean): string {
  const point = `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
  return `${path}${start ? 'M' : 'L'}${point}`;
}

const useStyles = makeStyles((t) => ({
  pad: {
    borderRadius: t.radius.md,
    backgroundColor: t.color.paper.bright,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  line: {
    marginHorizontal: t.space['16'],
    marginBottom: t.space['24'],
    borderBottomWidth: 1.5,
    borderColor: paperColours(t).border,
  },
  hint: { position: 'absolute', start: t.space['16'], bottom: t.space['6'] },
  typed: { position: 'absolute', start: t.space['16'], bottom: t.space['24'] },
}));

/**
 * A signing pad on paper: sign with a finger, or (button, or the screen-reader action) sign by
 * typing your name, set in the signature hand. `value` is the drawn path or the typed name.
 */
export function SignatureLayer({
  name,
  value,
  onChange,
  height = 140,
  testID,
}: SignatureLayerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const drawn = value?.kind === 'drawn' ? value.path : '';
  const addPoint = (x: number, y: number, start: boolean) =>
    onChange({ kind: 'drawn', path: appendPoint(drawn, x, y, start) });

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      'worklet';
      scheduleOnRN(addPoint, event.x, event.y, true);
    })
    .onUpdate((event) => {
      'worklet';
      scheduleOnRN(addPoint, event.x, event.y, false);
    });

  const typeName = () => onChange({ kind: 'typed', name });
  const clear = () => onChange(null);
  const signLabel = t({ id: 'common.signature.pad', message: 'Signature pad' });
  const typedAction = t({ id: 'common.signature.typeName', message: 'Sign with my name' });
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'activate') typeName();
  };
  const onLayout = (event: LayoutChangeEvent) =>
    setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height });

  return (
    <Stack gap="8" testID={testID}>
      <GestureDetector gesture={pan}>
        <View
          style={[styles.pad, { height }]}
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={signLabel}
          accessibilityValue={{
            text:
              value === null
                ? t({ id: 'common.signature.empty', message: 'Not signed' })
                : t({ id: 'common.signature.signed', message: 'Signed' }),
          }}
          accessibilityActions={[{ name: 'activate', label: typedAction }]}
          onAccessibilityAction={onAction}
        >
          {size.width > 0 && drawn ? (
            <Canvas style={{ position: 'absolute', width: size.width, height: size.height }}>
              <Path
                path={drawn}
                style="stroke"
                strokeWidth={STROKE}
                strokeCap="round"
                strokeJoin="round"
                color={theme.color.paper.ink}
              />
            </Canvas>
          ) : null}
          {value?.kind === 'typed' ? (
            <Text variant="voiceSignature" color={theme.color.paper.ink} style={styles.typed}>
              {value.name}
            </Text>
          ) : null}
          <View style={styles.line} />
          {value === null ? (
            <Text variant="monoData" color={paperColours(theme).label} style={styles.hint}>
              {t({ id: 'common.signature.hint', message: 'Sign here' })}
            </Text>
          ) : null}
        </View>
      </GestureDetector>
      <Row gap="8">
        <PillButton size="sm" variant="secondary" label={typedAction} onPress={typeName} />
        {value !== null ? (
          <PillButton
            size="sm"
            variant="tertiary"
            label={t({ id: 'common.signature.clear', message: 'Clear' })}
            onPress={clear}
          />
        ) : null}
      </Row>
    </Stack>
  );
}
