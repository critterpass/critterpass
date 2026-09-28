/**
 * A join link's QR code (undesigned; from the paper card and design tokens): dark modules on the
 * light paper colour whatever the theme, since cameras need the contrast, drawn with Skia. Read
 * by screen readers as the link it opens.
 */
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { t } from '@lingui/core/macro';
import { useMemo } from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '@/ui/theme';

import { qrPath } from './qr-path';

const useStyles = makeStyles((th) => ({
  card: {
    alignSelf: 'center',
    backgroundColor: th.color.paper.base,
    borderRadius: th.radius.sm,
  },
}));

export function JoinQr({
  url,
  size = 200,
  testID,
}: {
  readonly url: string;
  readonly size?: number;
  readonly testID?: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const qr = useMemo(() => qrPath(url), [url]);
  const scale = size / qr.size;
  return (
    <View
      style={[styles.card, { width: size, height: size }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t({ id: 'crew.qr.a11y', message: `QR code for ${url}` })}
      testID={testID}
    >
      <Canvas style={{ width: size, height: size }}>
        <Group transform={[{ scale }]}>
          <Path path={qr.path} color={theme.color.paper.ink} />
        </Group>
      </Canvas>
    </View>
  );
}
