/**
 * What the unboosted crew map previews (9.19): the crew's faces scattered over the map's top half
 * and you as the sun dot, so the boost card shows what it switches on. Nobody's place is real:
 * the map is off until the trip is boosted, and these spots are fixed.
 */
import { StyleSheet, View } from 'react-native';

import { crewAccent } from '@/features/trip';
import { Avatar, usePremiumTheme } from '@/ui/premium';

import type { LiveMapModel } from '../model';

/** Where the faces sit, as shares of the preview's width and height (the design's scatter). */
const SPOTS = [
  { x: 0.2, y: 0.24 },
  { x: 0.78, y: 0.12 },
  { x: 0.28, y: 0.42 },
  { x: 0.72, y: 0.56 },
  { x: 0.13, y: 0.78 },
  { x: 0.58, y: 0.8 },
] as const;
const FACE = 34;
const YOU = 22;

export function GatePreview({ m, height }: { readonly m: LiveMapModel; readonly height: number }) {
  const th = usePremiumTheme();
  const crew = (m.view?.people ?? []).filter((person) => !person.isMe).slice(0, SPOTS.length);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.area, { height }]}
      testID="live-map-gate-preview"
    >
      {crew.map((person, index) => {
        const spot = SPOTS[index] ?? SPOTS[0];
        return (
          <View
            key={person.uid}
            style={[
              styles.face,
              {
                left: `${String(spot.x * 100)}%`,
                top: `${String(spot.y * 100)}%`,
                boxShadow: th.shadow.sticker,
              },
            ]}
          >
            <Avatar
              name={person.name}
              color={crewAccent(person.joinIndex)}
              uid={person.uid}
              size={FACE}
              ringed
            />
          </View>
        );
      })}
      <View
        style={[
          styles.you,
          {
            backgroundColor: th.accent.sun,
            borderColor: th.accent.stickerEdge,
            // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS shadow, never copy
            boxShadow: `0 0 0 14px ${th.color.status.maybe.bg}`,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  area: { position: 'absolute', left: 0, right: 0, top: 0 },
  face: { position: 'absolute', marginLeft: -FACE / 2, marginTop: -FACE / 2, borderRadius: FACE },
  you: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: YOU,
    height: YOU,
    marginLeft: -YOU / 2,
    marginTop: -YOU / 2,
    borderRadius: YOU / 2,
    borderWidth: 2.5,
  },
});
