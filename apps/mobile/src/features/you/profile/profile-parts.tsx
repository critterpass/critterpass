/** The pieces the profile (3n-1) is drawn from: the face, a stat tile, taste pills, the stamps row. */
import { resolveMemberStyle } from '@cp/design-tokens';
import type { TasteTag } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { tagWords } from '@/features/onboarding';
import { regionName } from '@/features/onboarding';
import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { CountUp } from '@/ui/data/CountUp';
import { Stamp } from '@/ui/documents/Stamp';
import { Row } from '@/ui/layout/Row';
import { Sticker } from '@/ui/sticker/Sticker';
import { SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { stampBottom, stampLabel } from './profile-copy';
import type { AvatarRing, ProfileAvatar, ProfileStamp } from './profile-model';
import { useStampLanding } from './stamp-landing';

export const AVATAR = 84;
const STAMP = 72;
const STAMP_OVERLAP = -8;
const STAMP_TILTS = [-8, 6, -4, 9, -3];

const useStyles = makeStyles((t) => ({
  ring: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: t.color.ink[600],
    overflow: 'hidden',
  },
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space['14'],
    paddingVertical: t.space['12'],
    gap: t.space['2'],
  },
  stamps: { flexDirection: 'row', alignItems: 'center', minHeight: STAMP + t.space['8'] },
  tag: { borderRadius: 999, paddingHorizontal: t.space['12'], paddingVertical: t.space['8'] },
}));

export function ProfileFace({
  avatar,
  name,
  ring = null,
  photoUri = null,
}: {
  readonly avatar: ProfileAvatar;
  readonly name: string;
  /** The worn critter's rarity ring (rare blue, epic pink, legendary gold). */
  readonly ring?: AvatarRing | null;
  /** The person's own photo, once its link has been read. */
  readonly photoUri?: string | null;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  if (photoUri) {
    return (
      <View style={styles.ring} testID="you-profile-face">
        <Image
          source={{ uri: photoUri }}
          style={{ width: AVATAR, height: AVATAR }}
          accessibilityLabel={name}
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }
  if (avatar.kind === 'guide') {
    const guide = GUIDE_STICKERS[avatar.guide];
    return (
      <View
        style={[
          styles.ring,
          { backgroundColor: theme.color.paper.base },
          ring === null ? null : { borderColor: theme.tier[ring].color },
        ]}
        testID="you-profile-face"
      >
        <Sticker kind={guide.kind} name={guide.name} size={AVATAR - 16} />
      </View>
    );
  }
  return (
    <View
      style={[styles.ring, { backgroundColor: resolveMemberStyle(0).color }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
    >
      <SurfaceToneProvider value="accent">
        <Text variant="h2">{upper(name.slice(0, 1), locale)}</Text>
      </SurfaceToneProvider>
    </View>
  );
}

export function StatTile(props: {
  readonly value: number;
  readonly label: string;
  readonly color: string;
  readonly testID: string;
}) {
  const styles = useStyles();
  return (
    <View
      style={[styles.tile, { backgroundColor: props.color }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${props.value} ${props.label}`}
      testID={props.testID}
    >
      <SurfaceToneProvider value="accent">
        <CountUp value={props.value} variant="h2" />
        <Text variant="label">{props.label}</Text>
      </SurfaceToneProvider>
    </View>
  );
}

export function SectionHead({
  title,
  action,
}: {
  readonly title: string;
  readonly action?: ReactNode;
}) {
  return (
    <Row justify="space-between">
      <Text variant="eyebrow" accessibilityRole="header">
        {title}
      </Text>
      {action}
    </Row>
  );
}

export function Tags({ tags }: { readonly tags: readonly TasteTag[] }) {
  const styles = useStyles();
  const theme = useTheme();
  const colours = [
    theme.color.yellow,
    theme.color.pink,
    theme.color.blue,
    theme.color.green.base,
    theme.color.paper.base,
  ];
  return (
    <Row gap="8" wrap>
      {tags.map((tag, index) => (
        <View key={tag} style={[styles.tag, { backgroundColor: colours[index % colours.length] }]}>
          <SurfaceToneProvider value="accent">
            <Text variant="label">{tagWords(tag).full}</Text>
          </SurfaceToneProvider>
        </View>
      ))}
    </Row>
  );
}

/** One stamp landing in its turn: a short drop with a soft thud, staggered along the row. */
function LandingStamp({
  index,
  children,
}: {
  readonly index: number;
  readonly children: ReactNode;
}) {
  const style = useStampLanding(index);
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** The ink a stamp is drawn in: the destination's own, else a rotation of the accents. */
function inkOf(stamp: ProfileStamp, index: number, theme: ReturnType<typeof useTheme>): string {
  const inks = [theme.color.blue, theme.color.orange, theme.color.pink, theme.color.green.base];
  switch (stamp.kind) {
    case 'upcoming':
      return theme.color.yellow;
    case 'home':
      return theme.color.orange;
    case 'self':
      return theme.color.paper.base;
    case 'trip':
      return stamp.ink ?? inks[index % inks.length] ?? theme.color.blue;
  }
}

/** A stamp's place line: a self-reported trip names its country in the reader's language. */
export function stampTitle(stamp: ProfileStamp, locale: string): string {
  return stamp.kind === 'self' ? (regionName(stamp.title, locale) ?? stamp.title) : stamp.title;
}

/** One passport stamp at `size`; self-reported and upcoming ones stay dashed. */
export function ProfileStampFace({
  stamp,
  index,
  size = STAMP,
  bare = false,
  testID,
}: {
  readonly stamp: ProfileStamp;
  readonly index: number;
  readonly size?: number;
  /** Only the place, for small faces where the curved lines cannot fit. */
  readonly bare?: boolean;
  readonly testID?: string;
}) {
  const { t } = useLingui();
  const theme = useTheme();
  const locale = useLocale();
  const bottom = stampBottom(stamp, locale);
  const top =
    stamp.kind === 'home'
      ? t({ id: 'you.profile.stamp.home', message: 'Home' })
      : stamp.kind === 'self'
        ? t({ id: 'you.profile.stamp.selfReported', message: 'Self-reported' })
        : undefined;
  return (
    <Stamp
      title={upper(stampTitle(stamp, locale), locale)}
      {...(top === undefined || bare ? {} : { top: upper(top, locale) })}
      {...(bottom === undefined || bare ? {} : { bottom: upper(bottom, locale) })}
      ink={inkOf(stamp, index, theme)}
      shape={stamp.kind === 'upcoming' || stamp.kind === 'self' ? 'pending' : 'round'}
      size={size}
      tilt={STAMP_TILTS[index % STAMP_TILTS.length] ?? 0}
      accessibilityLabel={stampLabel({ ...stamp, title: stampTitle(stamp, locale) }, locale)}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}

/** The stamps, hand-tilted and overlapping; the next trip's stays dashed until it is stamped. */
export function StampRow({ stamps }: { readonly stamps: readonly ProfileStamp[] }) {
  const styles = useStyles();
  if (stamps.length === 0) return null;
  return (
    <View style={styles.stamps} testID="you-profile-stamps">
      {stamps.map((stamp, index) => (
        <View key={stamp.id} style={index > 0 ? { marginStart: STAMP_OVERLAP } : null}>
          <LandingStamp index={index}>
            <ProfileStampFace
              stamp={stamp}
              index={index}
              testID={`you-profile-stamp-${stamp.kind}`}
            />
          </LandingStamp>
        </View>
      ))}
    </View>
  );
}
