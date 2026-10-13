/**
 * The story's cover (8.13): the place in huge letters on the guide's ground, its tags (days, how
 * many of you, sunrises) tilted like stickers, the trip's found forms slapped around it and the
 * guide cheering, floating.
 */
import { View } from 'react-native';

import { Float } from '@/features/critters';
import { guideSticker } from '@/ui/avatar/guides';
import { CritterSticker, Tag, Text, usePremiumTheme } from '@/ui/premium';

import type { CoverCardProps } from '../../../story/story-card-views';
import { CardFrame, FormSticker } from './card-frame';

const SPOTS = [
  { left: '6%', top: '4%', tilt: -8 },
  { left: '68%', top: '0%', tilt: 10 },
  { left: '74%', top: '44%', tilt: -6 },
  { left: '2%', top: '50%', tilt: 7 },
] as const;
const TAG_TILTS = [-4, 3, -2] as const;

export function PremiumCoverCard({ guide, ground, eyebrow, place, chips, forms }: CoverCardProps) {
  const th = usePremiumTheme();
  const art = guideSticker(guide);
  return (
    <CardFrame ground={ground} testID="recap-card-cover">
      <Text variant="label" tone="onAccent">
        {eyebrow}
      </Text>
      <View style={{ flex: 1 }}>
        {forms.slice(0, SPOTS.length).map((row, index) => {
          const spot = SPOTS[index] ?? SPOTS[0];
          return (
            <View
              key={row.id}
              style={{
                position: 'absolute',
                left: spot.left,
                top: spot.top,
                transform: [{ rotate: `${spot.tilt}deg` }],
              }}
            >
              <FormSticker row={row} size={62} />
            </View>
          );
        })}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Float ms={4600}>
            <CritterSticker kind={art.kind} name={art.name} size={140} pose="cheer" />
          </Float>
        </View>
      </View>
      <Text variant="hero" tone="onAccent" numberOfLines={1} adjustsFontSizeToFit>
        {place}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {chips.map((chip, index) => (
          <Tag
            key={chip}
            label={chip}
            color={[th.accent.sky, th.accent.pink, th.accent.sun][index % 3] ?? th.accent.sun}
            rotate={TAG_TILTS[index % TAG_TILTS.length] ?? 0}
          />
        ))}
      </View>
    </CardFrame>
  );
}
