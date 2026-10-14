/**
 * The crew map before the trip is boosted (9.19): the header's light "Preview · your Bali trip"
 * capsule, and the crew's faces scattered over the map the way the live map would show them, with
 * you as the glowing dot. The faces are a picture of what boosting turns on, not where anyone is:
 * nobody's location is read for them.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { crewAccent } from '@/features/trip';
import { Avatar, Text, usePremiumTheme } from '@/ui/premium';

import type { LiveMapModel } from '../model';

/** Where the faces sit, as fractions of the map above the Boost card (the design's layout). */
const SPOTS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 0.2, y: 0.24 },
  { x: 0.28, y: 0.38 },
  { x: 0.72, y: 0.48 },
  { x: 0.8, y: 0.18 },
  { x: 0.13, y: 0.66 },
  { x: 0.62, y: 0.12 },
];
const FACE = 34;
const ME = 26;

export function PreviewPill({ place }: { readonly place: string }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  return (
    <View
      style={[styles.pill, { backgroundColor: th.color.card, boxShadow: th.shadow.float }]}
      testID="live-map-preview-pill"
    >
      <Text variant="label" tone="inkSecondary" numberOfLines={1}>
        {t({
          id: 'liveMap.premium.previewPill',
          message: `Preview · your ${place} trip`,
        }).toLocaleUpperCase()}
      </Text>
    </View>
  );
}

/** The crew's faces over the map, above the card that takes the foot of the screen. */
export function PreviewFaces({ m, height }: { readonly m: LiveMapModel; readonly height: number }) {
  const th = usePremiumTheme();
  const people = (m.view?.people ?? [])
    .filter((person) => person.uid !== m.me)
    .slice(0, SPOTS.length);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { bottom: undefined, height }]}
      testID="live-map-preview-faces"
    >
      {people.map((person, index) => {
        const spot = SPOTS[index] ?? { x: 0.5, y: 0.5 };
        return (
          <View
            key={person.uid}
            style={[
              styles.face,
              {
                left: `${String(spot.x * 100)}%`,
                top: spot.y * height,
                borderColor: th.color.card,
                boxShadow: th.shadow.float,
              },
            ]}
          >
            <Avatar name={person.name} color={crewAccent(person.joinIndex)} size={FACE} />
          </View>
        );
      })}
      <View style={[styles.me, { top: 0.4 * height }]}>
        <View style={[styles.halo, { backgroundColor: th.accent.sun }]} />
        <View
          style={[styles.meDot, { backgroundColor: th.accent.sun, borderColor: th.color.card }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: { position: 'absolute', borderWidth: 2, borderRadius: FACE / 2 + 2 },
  me: {
    position: 'absolute',
    left: '50%',
    width: ME * 2,
    height: ME * 2,
    marginLeft: -ME,
    borderRadius: ME,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: { ...StyleSheet.absoluteFill, borderRadius: ME, opacity: 0.3 },
  meDot: { width: ME, height: ME, borderRadius: ME / 2, borderWidth: 3 },
});
