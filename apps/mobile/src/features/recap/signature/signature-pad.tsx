/**
 * The signing pad for the crew stamp, in the premium look: sign with a finger on the card, or (the
 * button, or the screen-reader action) sign by typing your name, set in the signature hand. The
 * value is the drawn path or the typed name.
 */
import { t } from '@lingui/core/macro';
import { Canvas, Path } from '@shopify/react-native-skia';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { AccessibilityActionEvent, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { Button, Text, TextButton, usePremiumTheme } from '@/ui/premium';

export type Signature =
  | { readonly kind: 'drawn'; readonly path: string }
  | { readonly kind: 'typed'; readonly name: string };

export interface SignaturePadProps {
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

export function SignaturePad({ name, value, onChange, height = 140, testID }: SignaturePadProps) {
  const th = usePremiumTheme();
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
  const typedAction = t({ id: 'common.signature.typeName', message: 'Sign with my name' });
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'activate') typeName();
  };
  const onLayout = (event: LayoutChangeEvent) =>
    setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height });

  return (
    <View style={styles.root} testID={testID}>
      <GestureDetector gesture={pan}>
        <View
          style={[
            styles.pad,
            { height, backgroundColor: th.color.card, borderRadius: th.radius.card },
          ]}
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t({ id: 'common.signature.pad', message: 'Signature pad' })}
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
                color={th.color.ink}
              />
            </Canvas>
          ) : null}
          {value?.kind === 'typed' ? (
            <Text
              variant="guideName"
              tone="ink"
              style={[
                styles.typed,
                { fontSize: th.type.largeTitle.size, lineHeight: th.type.largeTitle.size * 1.25 },
              ]}
            >
              {value.name}
            </Text>
          ) : null}
          <View style={[styles.line, { borderColor: th.color.hairline }]} />
          {value === null ? (
            <Text variant="caption" tone="muted" style={styles.hint}>
              {t({ id: 'common.signature.hint', message: 'Sign here' })}
            </Text>
          ) : null}
        </View>
      </GestureDetector>
      <View style={styles.actions}>
        <Button
          alignSelf="auto"
          size="small"
          variant="secondary"
          label={typedAction}
          onPress={typeName}
        />
        {value === null ? null : (
          <TextButton
            label={t({ id: 'common.signature.clear', message: 'Clear' })}
            onPress={() => onChange(null)}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  pad: { overflow: 'hidden', justifyContent: 'flex-end' },
  line: { marginHorizontal: 16, marginBottom: 24, borderBottomWidth: 1.5 },
  hint: { position: 'absolute', start: 16, bottom: 6 },
  typed: { position: 'absolute', start: 16, bottom: 24 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
