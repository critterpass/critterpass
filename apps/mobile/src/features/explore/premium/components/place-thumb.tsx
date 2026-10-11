/**
 * A place's square thumb in a premium list row: its photo when one has arrived, else its kind's
 * doodle on the control fill. Radius 12 at 44–48 pt, as the Find, offline and nearby rows draw it.
 */
import { Image, View, type ImageSourcePropType } from 'react-native';

import { usePremiumTheme } from '@/ui/premium';

import { Doodle, type DoodleName } from './doodle';

export interface PlaceThumbProps {
  readonly photo?: ImageSourcePropType | undefined;
  readonly icon: DoodleName;
  readonly size: number;
  /** @default 12 */
  readonly radius?: number;
}

/** How much of the thumb the doodle fills when there is no photo. */
const DOODLE_SHARE = 0.72;

export function PlaceThumb({ photo, icon, size, radius }: PlaceThumbProps) {
  const t = usePremiumTheme();
  const corner = radius ?? t.radius.dayBadge;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: corner,
        overflow: 'hidden',
        backgroundColor: t.color.control,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {photo === undefined ? (
        <Doodle name={icon} size={Math.round(size * DOODLE_SHARE)} />
      ) : (
        <Image source={photo} resizeMode="cover" style={{ width: size, height: size }} />
      )}
    </View>
  );
}
