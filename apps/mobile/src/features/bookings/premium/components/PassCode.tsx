/**
 * The scannable code on a pass: the QR drawn from the module grid in ink on a white square with a
 * thin field-border ring, always light (scanners read it). With no saved code it says where the
 * code will come from instead of drawing an empty square.
 */
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';

import { premium } from '@cp/design-tokens';
import { ring, Text } from '@/ui/premium';

import { qrPath } from '../../boarding-pass/qr-path';

const LIGHT = premium.modes.light.color;

export function PassCode({
  payload,
  size,
  missing,
}: {
  readonly payload: string | null;
  readonly size: number;
  readonly missing: string;
}) {
  const qr = useMemo(() => (payload === null ? null : qrPath(payload)), [payload]);
  return (
    <View
      style={{
        width: size,
        height: size,
        padding: 10,
        borderRadius: 14,
        backgroundColor: LIGHT.card,
        boxShadow: ring(1, LIGHT.fieldBorder, true),
        alignItems: 'center',
        justifyContent: 'center',
      }}
      testID="bookings-pass-code"
    >
      {qr === null ? (
        <Text variant="caption" color={LIGHT.muted} align="center">
          {missing}
        </Text>
      ) : (
        <Canvas style={{ width: size - 20, height: size - 20 }}>
          <Group transform={[{ scale: (size - 20) / qr.size }]}>
            <Path path={qr.path} color={LIGHT.ink} />
          </Group>
        </Canvas>
      )}
    </View>
  );
}
