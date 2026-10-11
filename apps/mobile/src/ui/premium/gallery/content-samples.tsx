/* eslint-disable lingui/no-unlocalized-strings -- the dev kit gallery's sample labels, never shipped copy. */
import PHOTO from '../../../../assets/icon.png';

import { Card, ListCard } from '../cards/Card';
import { GuideNote } from '../cards/GuideNote';
import { DayBadge, Row } from '../cards/Row';
import { PhotoCard, StatTile } from '../cards/StatTile';
import { StatusTag } from '../cards/StatusTag';
import type { StatusTone } from '../cards/StatusTag';
import { Avatar, CrewStack } from '../people/Avatar';
import { CritterSticker } from '../stickers/CritterSticker';
import { RectStamp, RoundStamp } from '../stickers/Stamp';
import { EmptySlot, Tag } from '../stickers/Tag';
import { TierLabel } from '../stickers/TierLabel';
import type { CritterTier } from '../stickers/TierLabel';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { GalleryRow, GallerySection } from './gallery-section';

const TIERS: readonly CritterTier[] = ['common', 'rare', 'epic', 'legendary', 'locked'];
const STATUSES: readonly [StatusTone, string][] = [
  ['booked', 'Booked'],
  ['voteOpen', 'Vote open'],
  ['rain', 'Rain'],
  ['maybe', 'Maybe'],
  ['unopened', 'Unopened'],
  ['tangerine', 'Leave 8:10'],
];

export function StickerSamples() {
  const t = usePremiumTheme();
  return (
    <GallerySection title="Stickers, tags, stamps">
      <GalleryRow>
        <Tag label="Ubud" color={t.accent.sun} />
        <Tag label="Canggu" color={t.accent.pink} rotate={4} />
        <EmptySlot label="Add a place" />
      </GalleryRow>
      <GalleryRow>
        <RoundStamp word="BALI" top="CRITTERPASS" bottom="12 OCT 2026" />
        <RoundStamp word="PT" top="LISBON" bottom="JUN 2024" ink="green" size={110} />
        <RectStamp word="BOOSTED" />
      </GalleryRow>
      <GalleryRow>
        <CritterSticker kind="gecko" name="Tokek" size={78} />
        <CritterSticker kind="tanuki" name="Pon" size={78} pose="wave" />
        <CritterSticker kind="axolotl" name="Locked critter" size={78} variant="mask" />
        <CritterSticker
          kind="puffin"
          name="Locked rare critter"
          size={78}
          variant="mask"
          maskColor={t.color.lockedMaskGold}
        />
      </GalleryRow>
      <GalleryRow>
        {TIERS.map((tier) => (
          <TierLabel key={tier} tier={tier} />
        ))}
      </GalleryRow>
    </GallerySection>
  );
}

export function CardSamples() {
  const t = usePremiumTheme();
  return (
    <GallerySection title="Cards and rows">
      <ListCard>
        <Row
          title="Monkey forest"
          subtitle="Ubud · 2 h"
          leading={<DayBadge day="12" weekday="SAT" color={t.accent.sun} />}
          badgeLeads
          trailing={<StatusTag label="Booked" tone="booked" />}
          onPress={noop}
        />
        <Row
          title="Sunset at Uluwatu"
          subtitle="Vote closes tonight"
          leading={<DayBadge day="13" weekday="SUN" color={t.accent.pink} />}
          badgeLeads
          trailingText="18:10"
        />
        <Row
          variant="person"
          title="Linh added two places"
          leading={<Avatar name="Linh" color={t.accent.mint} />}
          trailingText="2 min"
        />
      </ListCard>
      <GalleryRow>
        {STATUSES.map(([tone, label]) => (
          <StatusTag key={tone} tone={tone} label={label} />
        ))}
      </GalleryRow>
      <GuideNote
        name="Tokek"
        text="Rain after three on Saturday. Swap the beach for the rice terraces?"
        action={{ label: 'Swap them', onPress: noop }}
      />
      <GuideNote name="Pon" critter="tanuki" tint="pon" text="I kept your seats together." />
      <GalleryRow>
        <StatTile
          label="Spent"
          value="$412"
          sticker={<CritterSticker kind="gecko" name="Tokek" size={34} />}
        />
        <StatTile label="Nights" value="5" />
      </GalleryRow>
      <PhotoCard source={PHOTO} accessibilityLabel="A trip photo" height={160} />
      <Card padded>
        <Text variant="body">A plain card holds anything; glass never goes inside one.</Text>
      </Card>
      <GalleryRow>
        <Avatar name="Khanh" color={t.accent.sun} size={40} />
        <CrewStack
          accessibilityLabel="Khanh, Linh, Minh and two more"
          members={[
            { id: 'a', name: 'Khanh', color: t.accent.sun },
            { id: 'b', name: 'Linh', color: t.accent.mint },
            { id: 'c', name: 'Minh', color: t.accent.sky },
            { id: 'd', name: 'An', color: t.accent.pink },
            { id: 'e', name: 'Bao', color: t.accent.tangerine },
          ]}
          max={3}
        />
      </GalleryRow>
    </GallerySection>
  );
}

function noop(): void {}
