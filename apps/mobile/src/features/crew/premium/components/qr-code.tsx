/**
 * A join link's QR code in the premium kit: dark modules on paper whatever the mode (scanners need
 * the contrast; QR codes stay light, foundations 1.E), in a white tile with the field border, read
 * by screen readers as the link it opens.
 */
/* eslint-disable lingui/no-unlocalized-strings -- style values, never copy. */
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { t } from '@lingui/core/macro';
import { useMemo } from 'react';
import { View } from 'react-native';

import { usePremiumTheme } from '@/ui/premium';

import { qrPath } from '../../invite-composer/qr-path';

export function QrCode({
  url,
  size,
  testID,
}: {
  readonly url: string;
  readonly size: number;
  readonly testID?: string;
}) {
  const th = usePremiumTheme();
  const qr = useMemo(() => qrPath(url), [url]);
  const scale = size / qr.size;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t({ id: 'crew.qr.a11y', message: `QR code for ${url}` })}
      testID={testID}
      style={{
        width: size,
        height: size,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: th.accent.paper,
        boxShadow: `inset 0 0 0 1.5px ${th.color.fieldBorder}`,
      }}
    >
      <Canvas style={{ width: size, height: size }}>
        <Group transform={[{ scale }]}>
          <Path path={qr.path} color={th.color.onAccent} />
        </Group>
      </Canvas>
    </View>
  );
}
