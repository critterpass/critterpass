/**
 * The splash's collage (2.01): the Batur and Penida polaroids tilted behind the tangerine passport,
 * their place tags, the guides and doodles floating round it, and Tokek waving with his sticky
 * note. Laid out on the design's 390 pt stage and scaled to the room the page leaves, so it keeps
 * its composition on every phone. Everything is bundled: a first launch without signal looks the
 * same.
 */
import { t } from '@lingui/core/macro';
import { useState, type ReactNode } from 'react';
import { Image, View, type ImageSourcePropType, type LayoutChangeEvent } from 'react-native';

import { CritterSticker, Tag, Text, usePremiumTheme } from '@/ui/premium';

import BATUR from '../../../../../assets/splash-photos/batur-sunrise.jpg';
import PENIDA from '../../../../../assets/splash-photos/kelingking.jpg';
import { guideFace } from '../../photo/use-photo-step';
import { IdleFloat } from '../components/IdleFloat';
import { tilt } from '../components/tilt';

/** The design's stage: the phone's width, from under the status bar to the tagline. */
const STAGE = { width: 390, height: 520 } as const;

const FLOATERS = [
  { id: 'pon', x: 12, y: 302, size: 92, period: 4600, delay: 0 },
  { id: 'lundi', x: 300, y: 8, size: 72, period: 5000, delay: 700 },
  { id: 'sardi', x: 276, y: 416, size: 96, period: 5000, delay: 900 },
] as const;

function At({
  x,
  y,
  rotate = 0,
  z,
  children,
}: {
  readonly x: number;
  readonly y: number;
  readonly rotate?: number;
  readonly z: number;
  readonly children: ReactNode;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        zIndex: z,
        ...(rotate === 0 ? {} : { transform: [{ rotate: tilt(rotate) }] }),
      }}
    >
      {children}
    </View>
  );
}

function Polaroid({
  source,
  width,
  height,
}: {
  readonly source: ImageSourcePropType;
  readonly width: number;
  readonly height: number;
}) {
  const theme = usePremiumTheme();
  return (
    <View
      style={{
        width,
        height,
        padding: 6,
        borderRadius: 16,
        backgroundColor: theme.accent.stickerEdge,
        boxShadow: theme.shadow.card,
      }}
    >
      <Image
        source={source}
        resizeMode="cover"
        style={{ flex: 1, width: '100%', borderRadius: 11 }}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

export function SplashCollage({ cover }: { readonly cover: ReactNode }) {
  const theme = usePremiumTheme();
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null);
  const tokek = guideFace('tokek');
  const doodles = {
    camera: t({ id: 'onboarding.premium.splash.camera', message: 'Camera' }),
    plane: t({ id: 'onboarding.premium.splash.plane', message: 'Plane' }),
  };
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setRoom({ width, height });
  };
  const scale =
    room === null ? 1 : Math.min(room.width / STAGE.width, room.height / STAGE.height, 1.15);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onLayout={onLayout}>
      {room === null ? null : (
        <View style={{ ...STAGE, transform: [{ scale }] }} testID="onboarding-collage">
          <At x={26} y={38} rotate={-8} z={1}>
            <Polaroid source={BATUR} width={166} height={206} />
          </At>
          <At x={196} y={58} rotate={7} z={1}>
            <Polaroid source={PENIDA} width={162} height={198} />
          </At>
          <At x={103} y={178} z={3}>
            <IdleFloat periodMs={4200} lift={6} sway={1}>
              <View style={{ transform: [{ rotate: tilt(-4) }] }}>{cover}</View>
            </IdleFloat>
          </At>
          {FLOATERS.map((floater) => {
            const face = guideFace(floater.id);
            return (
              <At key={floater.id} x={floater.x} y={floater.y} z={4}>
                <IdleFloat periodMs={floater.period} delayMs={floater.delay}>
                  <CritterSticker
                    kind={face.kind}
                    name={face.name}
                    seed={face.seed}
                    size={floater.size}
                  />
                </IdleFloat>
              </At>
            );
          })}
          <At x={44} y={416} rotate={-12} z={4}>
            <CritterSticker kind="camera" name={doodles.camera} seed={12} size={48} />
          </At>
          <At x={150} y={18} rotate={14} z={4}>
            <CritterSticker kind="plane" name={doodles.plane} seed={18} size={54} />
          </At>
          <At x={174} y={350} z={5}>
            <CritterSticker
              kind={tokek.kind}
              name={tokek.name}
              seed={tokek.seed}
              size={128}
              pose="wave"
            />
          </At>
          <At x={34} y={212} z={6}>
            <Tag
              label={t({ id: 'onboarding.premium.splash.batur', message: 'Batur' })}
              color={theme.accent.sun}
              rotate={-9}
            />
          </At>
          <At x={262} y={228} z={6}>
            <Tag
              label={t({ id: 'onboarding.premium.splash.penida', message: 'Penida' })}
              color={theme.accent.sky}
              rotate={8}
            />
          </At>
          <At x={254} y={324} rotate={7} z={6}>
            <View
              style={{
                paddingHorizontal: 12,
                paddingTop: 12,
                paddingBottom: 8,
                backgroundColor: theme.color.banner.guide.bg,
                borderRadius: 4,
                boxShadow: theme.shadow.raised,
              }}
            >
              <Text variant="guide" color={theme.color.banner.guide.text}>
                {t({ id: 'onboarding.premium.splash.note', message: 'Hi, I’m\nTokek!' })}
              </Text>
            </View>
          </At>
        </View>
      )}
    </View>
  );
}
