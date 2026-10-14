/**
 * A polaroid (3.02, 3.17): white frame (pad 5, r14), the photo inside at r10, tilted, with the
 * photo-card shadow. The photo is the destination's still; a place with no photo shows the paper
 * plane in the frame, never empty paper.
 */
/* eslint-disable lingui/no-unlocalized-strings -- CSS gradients and shadows, never copy. */
import { View } from 'react-native';

import { CritterSticker, makePremiumStyles } from '@/ui/premium';

import { TripPhoto } from './trip-photo';

const useStyles = makePremiumStyles((t) => ({
  frame: {
    padding: t.space.photoFrame,
    borderRadius: 14,
    backgroundColor: t.accent.paper,
    boxShadow: '0 2px 4px rgba(20,22,40,.1), 0 14px 28px rgba(20,22,40,.18)',
  },
  photo: { flex: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: t.color.control },
}));

export interface PolaroidProps {
  readonly slug: string | null;
  readonly index?: number;
  readonly width: number;
  readonly height: number;
  readonly rotate: number;
}

export function Polaroid({ slug, index = 0, width, height, rotate }: PolaroidProps) {
  const styles = useStyles();
  return (
    <View style={[styles.frame, { width, height, transform: [{ rotate: `${rotate}deg` }] }]}>
      <View style={styles.photo}>
        <TripPhoto
          slug={slug}
          index={index}
          empty={
            <CritterSticker
              kind="plane"
              name="plane"
              size={Math.round(Math.min(width, height) * 0.6)}
              edge={false}
            />
          }
        />
      </View>
    </View>
  );
}
