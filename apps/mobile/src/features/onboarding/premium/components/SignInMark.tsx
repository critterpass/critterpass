/**
 * The Apple logo and Google's "G" on the premium sign-in buttons. The "G" keeps Google's four
 * brand colours (their button rules require the multicolour mark); the Apple logo takes the
 * label's ink. Decorative: the button label names the provider.
 */
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { View } from 'react-native';

import { APPLE_PATH, GOOGLE_PATHS } from './provider-paths';
import { GOOGLE_COLOURS } from './onboarding-colours';

export function SignInMark({
  provider,
  color,
  size = 18,
}: {
  readonly provider: 'apple' | 'google';
  readonly color: string;
  readonly size?: number;
}) {
  const viewBox = provider === 'apple' ? 24 : 48;
  return (
    <View
      style={{ width: size, height: size }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Canvas style={{ width: size, height: size }}>
        <Group transform={[{ scale: size / viewBox }]}>
          {provider === 'apple' ? (
            <Path path={APPLE_PATH} color={color} />
          ) : (
            GOOGLE_PATHS.map((d, i) => (
              <Path key={d} path={d} color={GOOGLE_COLOURS[i] ?? GOOGLE_COLOURS[1]} />
            ))
          )}
        </Group>
      </Canvas>
    </View>
  );
}
