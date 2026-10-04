/**
 * A place's square picture in a row or card (7c-3, 7f-2, 7c-2): its photo when there is one, a
 * striped tile otherwise, with the category's doodle in a paper disc at the corner.
 */
import { Image, View, type ImageSourcePropType } from 'react-native';

import { Icon } from '../icons/Icon';
import type { DoodleName } from '../icons/generated';
import { makeStyles, useTheme } from '../theme';

export interface PlaceThumbProps {
  readonly photo?: ImageSourcePropType | undefined;
  readonly icon?: DoodleName | undefined;
  readonly size?: number | undefined;
  /** The tile's colour when there is no photo (the place's colour). */
  readonly tint?: string | undefined;
}

const useStyles = makeStyles((t) => ({
  tile: { borderRadius: t.radius.md, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  disc: {
    position: 'absolute',
    start: t.space['4'],
    bottom: t.space['4'],
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: t.color.paper.bright,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export function PlaceThumb({ photo, icon, size = 44, tint }: PlaceThumbProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, backgroundColor: tint ?? theme.color.ink[700] },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {photo === undefined ? null : <Image source={photo} style={styles.fill} resizeMode="cover" />}
      {icon === undefined ? null : (
        <View style={styles.disc}>
          <Icon name={icon} size={14} color={theme.color.paper.ink} decorative />
        </View>
      )}
    </View>
  );
}
