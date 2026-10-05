/* eslint-disable lingui/no-unlocalized-strings -- place names and fixture labels; fixture files are loaded only by the (dev) gallery and never ship. */
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';

import { guideSticker } from '../avatar/guides';
import { CountdownCard } from '../cards/CountdownCard';
import { InfoPill } from '../chips/InfoPill';
import { registerFixture } from '../gallery/registry';
import { Stack } from '../layout/Stack';
import { Sticker } from '../sticker/Sticker';
import type { TextVariant } from './Text';
import { Text } from './Text';

/** Home's next-up sticker size and the first day of the trip the hero counts down to. */
const HERO_STICKER = 124;
const FIRST_DAY = new Date('2026-10-01T12:00:00Z');

/**
 * Home's next-trip hero for a trip to Đà Nẵng with its guide, Chà Vá: the title wraps beside the
 * sticker, so the stacked mark of NẴNG sits under ĐÀ. Labels come from Home's own catalog entries,
 * so the Vietnamese gallery shows them as the app does.
 */
function DaNangHero() {
  const { i18n } = useLingui();
  const locale = useLocale();
  const guide = guideSticker('chava');
  const day = format.date(locale, FIRST_DAY, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <CountdownCard
      tone="red"
      eyebrow={upper(i18n._('home.nextUp.eyebrow', { day }), locale)}
      title={upper('Đà Nẵng', locale)}
      stickerSize={HERO_STICKER}
      sticker={<Sticker kind={guide.kind} name={guide.name} size={HERO_STICKER} pose="wave" />}
      meta={<InfoPill>{upper(i18n._('home.countdown.today'), locale)}</InfoPill>}
    />
  );
}

registerFixture('Text', 'display title on the next trip hero', () => <DaNangHero />);

/** Where else the same name is a title: the trip hub's header, a set page and a sheet. */
const TITLE_SIZES: readonly { readonly label: string; readonly variant: TextVariant }[] = [
  { label: 'trip hub header', variant: 'displayHero' },
  { label: 'set page', variant: 'displayXl' },
  { label: 'sheet title', variant: 'h1' },
];

/** Narrow enough that a two-word name wraps at every title size. */
const NARROW_BOX = 150;

registerFixture('Text', 'display title at each title size', () => (
  <Stack gap="16">
    {TITLE_SIZES.map(({ label, variant }) => (
      <Stack key={variant} gap="4">
        <Text variant="caption">{label}</Text>
        <Text variant={variant}>Đà Nẵng</Text>
        <View style={{ width: NARROW_BOX }}>
          <Text variant={variant} autoFit={false}>
            Đà Nẵng
          </Text>
        </View>
      </Stack>
    ))}
  </Stack>
));

const WRAPPED_NAMES = ['Hồ Chí Minh', 'Nhiệm vụ nhóm', 'Đặt chỗ', 'Mexico City', 'São Tomé'];

registerFixture('Text', 'display titles wrapped', () => (
  <Stack gap="16">
    {WRAPPED_NAMES.map((name) => (
      <View key={name} style={{ width: NARROW_BOX }}>
        <Text variant="h1" autoFit={false}>
          {name}
        </Text>
      </View>
    ))}
  </Stack>
));
