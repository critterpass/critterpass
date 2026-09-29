/**
 * A payee's payment QR (PayNow, PromptPay, VietQR, DuitNow): dark modules on the paper colour in
 * any theme (cameras need the contrast), drawn with Skia, read by screen readers as what it is.
 */
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { useLingui } from '@lingui/react/macro';
import { useMemo } from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '@/ui/theme';

import { qrPath } from './qr-path';

const useStyles = makeStyles((t) => ({
  card: { alignSelf: 'center', backgroundColor: t.color.paper.base, borderRadius: t.radius.sm },
}));

export function PayoutQr({
  payload,
  label,
  size = 220,
}: {
  readonly payload: string;
  /** "PayNow QR for Winston". */
  readonly label: string;
  readonly size?: number;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const qr = useMemo(() => qrPath(payload), [payload]);
  const scale = size / qr.size;
  return (
    <View
      style={[styles.card, { width: size, height: size }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t({
        id: 'money.pay.qrA11y',
        message: `${label}, scan it with your bank app`,
      })}
      testID="money-pay-qr"
    >
      <Canvas style={{ width: size, height: size }}>
        <Group transform={[{ scale }]}>
          <Path path={qr.path} color={theme.color.paper.ink} />
        </Group>
      </Canvas>
    </View>
  );
}
