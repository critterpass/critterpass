import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { CardTone } from '../cards/tone';
import { cardBackground, surfaceToneOf } from '../cards/tone';
import { PressScale } from '../press/PressScale';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface TiltedStickerProps {
  /** Place or option name printed on the label ("Kyoto"). */
  readonly label: string;
  /** @default 'paper' */
  readonly tone?: CardTone;
  /** Degrees; the design alternates small tilts across a board. @default -4 */
  readonly tilt?: number;
  /** Trailing content on the label, e.g. voters' `AvatarStack`. */
  readonly children?: ReactNode;
  /** Screen-reader text for `children` ("3 votes"). */
  readonly detail?: string;
  readonly onPress?: () => void;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: t.space['8'],
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space['12'],
    paddingVertical: t.space['8'],
    borderWidth: 2.5,
    borderColor: t.color.ink[850],
    shadowColor: t.shadow.hard.color,
    shadowOffset: { width: t.shadow.hard.offsetX, height: t.shadow.hard.offsetY / 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
}));

/** A tilted printed label stuck onto a board (vote options, map places), optionally tappable. */
export function TiltedSticker({
  label,
  tone = 'paper',
  tilt = -4,
  children,
  detail,
  onPress,
  testID,
}: TiltedStickerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const a11yLabel = detail ? `${label}, ${detail}` : label;
  const face = (
    <View
      style={[
        styles.tag,
        { backgroundColor: cardBackground(theme, tone), transform: [{ rotate: `${tilt}deg` }] },
      ]}
    >
      <SurfaceToneProvider value={surfaceToneOf(tone)}>
        <Text variant="h3">{label}</Text>
        {children}
      </SurfaceToneProvider>
    </View>
  );
  if (onPress) {
    return (
      <PressScale
        testID={testID}
        onPress={onPress}
        widthClass="narrow"
        accessibilityLabel={a11yLabel}
      >
        {face}
      </PressScale>
    );
  }
  return (
    <View testID={testID} accessible accessibilityLabel={a11yLabel}>
      {face}
    </View>
  );
}
