/**
 * The ISSUED stamp the first launch drops on the passport cover (10.02): a 112 pt double ring in
 * stamp pink on half-clear paper, brand line, ISSUED and the issue date. Art, not chrome: the stamp
 * type tokens never scale with the text size setting.
 */
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { StyleSheet, View } from 'react-native';

import { premium } from '@cp/design-tokens';

import { Text } from '@/ui/premium';

import { STAMP } from './launch-timeline';

const INK = premium.stamp.pink.ring;
/** The design's half-clear paper fill: paper at .55. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a hex alpha suffix on a token colour.
const FILL = `${premium.accent.paper}8c`;
const BRAND = 'CRITTERPASS';
const ISSUED = msg({
  id: 'launch.stamp.issued',
  message: 'ISSUED',
  comment: 'Passport stamp word, upper case, must fit a 112 pt round stamp',
});

export function IssuedStamp({ date }: { readonly date: string }) {
  const { i18n } = useLingui();
  return (
    <View style={styles.disc}>
      <View style={styles.innerRing} />
      <Text variant="stampSmall" color={INK}>
        {BRAND}
      </Text>
      <Text variant="stampWord" color={INK}>
        {i18n._(ISSUED)}
      </Text>
      <Text variant="stampSmall" color={INK}>
        {date}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    width: STAMP.size,
    height: STAMP.size,
    borderRadius: STAMP.size / 2,
    borderWidth: STAMP.outerRing,
    borderColor: INK,
    backgroundColor: FILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The second ring sits 8 pt in from the edge, so this far inside the outer border.
  innerRing: {
    position: 'absolute',
    top: STAMP.innerRingInset - STAMP.outerRing,
    left: STAMP.innerRingInset - STAMP.outerRing,
    right: STAMP.innerRingInset - STAMP.outerRing,
    bottom: STAMP.innerRingInset - STAMP.outerRing,
    borderRadius: STAMP.size / 2,
    borderWidth: STAMP.innerRing,
    borderColor: INK,
  },
});
