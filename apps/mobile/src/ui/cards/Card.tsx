import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { PressScale } from '../press/PressScale';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Halftone } from '../textures/halftone';
import { makeStyles, useTheme } from '../theme';
import type { CardTone } from './tone';
import { cardBackground, surfaceToneOf } from './tone';

export interface CardProps {
  /** @default 'raised' */
  readonly tone?: CardTone;
  /** Adds `tex.halftone` (every colour hero, ticket and accent card). */
  readonly halftone?: boolean;
  /** `lg` 20 for cards, `cardBig` 22 for heroes. @default 'lg' */
  readonly radius?: 'lg' | 'cardBig' | 'md';
  readonly onPress?: () => void;
  /** Required when `onPress` is set: one label for the whole card. */
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  card: { padding: t.size.cardInner.max, overflow: 'hidden' },
}));

/** Base surface for every card family: token fill, radius and inner padding, optional press. */
export function Card({
  tone = 'raised',
  halftone = false,
  radius = 'lg',
  onPress,
  accessibilityLabel,
  style,
  children,
  testID,
}: CardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const surface = [
    styles.card,
    { backgroundColor: cardBackground(theme, tone), borderRadius: theme.radius[radius] },
    style,
  ];
  const body = (
    <SurfaceToneProvider value={surfaceToneOf(tone)}>
      {halftone ? <Halftone /> : null}
      {children}
    </SurfaceToneProvider>
  );
  if (onPress) {
    return (
      <PressScale
        testID={testID}
        onPress={onPress}
        widthClass="wide"
        accessibilityLabel={accessibilityLabel ?? ''}
        style={surface}
      >
        {body}
      </PressScale>
    );
  }
  return (
    <View
      testID={testID}
      style={surface}
      {...(accessibilityLabel ? { accessible: true, accessibilityLabel } : {})}
    >
      {body}
    </View>
  );
}
