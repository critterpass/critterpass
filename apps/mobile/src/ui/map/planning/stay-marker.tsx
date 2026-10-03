/**
 * Where the crew sleeps: a yellow diamond with a bed (7a-1, 7b-1). One per map, so a `Marker` view
 * (live on both platforms) rather than a layer.
 */
import { tokens } from '@cp/design-tokens';
import { Marker, type LngLat } from '@maplibre/maplibre-react-native';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Icon } from '../../icons/Icon';
import { makeStyles } from '../../theme';

const SIDE = 26;
// eslint-disable-next-line lingui/no-unlocalized-strings -- rotation values, never copy.
const TURN = ['45deg', '-45deg'] as const;

const useStyles = makeStyles((t) => ({
  diamond: {
    width: SIDE,
    height: SIDE,
    borderRadius: t.radius.xs,
    backgroundColor: t.color.yellow,
    borderWidth: 2,
    borderColor: t.color.ink[850],
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: TURN[0] }],
  },
  upright: { transform: [{ rotate: TURN[1] }] },
}));

export function StayMarker({ lngLat }: { readonly lngLat: LngLat }) {
  const styles = useStyles();
  const { t } = useLingui();
  return (
    <Marker lngLat={lngLat} anchor="center">
      <View
        style={styles.diamond}
        accessible
        accessibilityLabel={t({ id: 'kit.stayMarker.label', message: 'Where you stay' })}
        testID="stay-marker"
      >
        <View style={styles.upright}>
          <Icon name="bed" size={14} color={tokens.color.ink[850]} decorative />
        </View>
      </View>
    </Marker>
  );
}
