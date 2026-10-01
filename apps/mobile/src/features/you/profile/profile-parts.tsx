/** The pieces the profile (3n-1) is drawn from: the face, a stat tile, taste pills, the stamps row. */
import { resolveMemberStyle } from '@cp/design-tokens';
import type { TasteTag } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { tagWords } from '@/features/onboarding';
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
import type { ProfileAvatar, ProfileStamp } from './profile-model';

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
}: {
  readonly avatar: ProfileAvatar;
  readonly name: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  if (avatar.kind === 'guide') {
    const guide = GUIDE_STICKERS[avatar.guide];
    return (
      <View style={[styles.ring, { backgroundColor: theme.color.paper.base }]}>
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

/** The stamps, hand-tilted and overlapping; the next trip's stays dashed until it is stamped. */
export function StampRow({ stamps }: { readonly stamps: readonly ProfileStamp[] }) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const inks = [theme.color.blue, theme.color.orange, theme.color.pink, theme.color.green.base];
  if (stamps.length === 0) return null;
  return (
    <View style={styles.stamps} testID="you-profile-stamps">
      {stamps.map((stamp, index) => {
        const bottom = stampBottom(stamp, locale);
        return (
          <View key={stamp.id} style={index > 0 ? { marginStart: STAMP_OVERLAP } : null}>
            <Stamp
              title={upper(stamp.title, locale)}
              {...(stamp.kind === 'home'
                ? { top: upper(t({ id: 'you.profile.stamp.home', message: 'Home' }), locale) }
                : {})}
              {...(bottom === undefined ? {} : { bottom: upper(bottom, locale) })}
              ink={
                stamp.kind === 'upcoming'
                  ? theme.color.yellow
                  : stamp.kind === 'home'
                    ? theme.color.orange
                    : (stamp.ink ?? inks[index % inks.length] ?? theme.color.blue)
              }
              shape={stamp.kind === 'upcoming' ? 'pending' : 'round'}
              size={STAMP}
              tilt={STAMP_TILTS[index % STAMP_TILTS.length] ?? 0}
              accessibilityLabel={stampLabel(stamp, locale)}
              testID={`you-profile-stamp-${stamp.kind}`}
            />
          </View>
        );
      })}
    </View>
  );
}
