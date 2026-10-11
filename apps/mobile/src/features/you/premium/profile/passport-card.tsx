/**
 * The passport page at the top of the pass (9.01): photo in its tier ring, name and handle, the
 * Pass+ and worn-critter stickers, the three counts over a dashed rule, and the machine line.
 */
import { useLingui } from '@lingui/react/macro';
import { Pressable, View } from 'react-native';

import { Tag, Text, TierLabel, usePremiumTheme } from '@/ui/premium';

import { statLabel } from '../../profile/profile-copy';
import type { ProfileModel } from '../../profile/profile-model';
import { PASS_PAPER } from '../pass-paper';
import { PremiumProfileFace } from './profile-face';

const FACE = 82;
/* eslint-disable lingui/no-unlocalized-strings -- a CSS pattern, never copy. */
const GUILLOCHE =
  'repeating-radial-gradient(circle at 20% 120%, rgba(23,20,42,.04) 0 1px, transparent 1px 7px)';
/* eslint-enable lingui/no-unlocalized-strings */

export interface PassportCardProps {
  readonly model: ProfileModel;
  readonly photoUri: string | null;
  readonly onPassPlus?: (() => void) | undefined;
}

function Stat({ value, label, testID }: { value: number; label: string; testID: string }) {
  return (
    <View style={{ flex: 1 }} testID={testID}>
      <Text variant="stat" color={PASS_PAPER.ink}>
        {String(value)}
      </Text>
      <Text variant="captionMuted" color={PASS_PAPER.label}>
        {label}
      </Text>
    </View>
  );
}

export function PassportCard({ model, photoUri, onPassPlus }: PassportCardProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const handle = [model.username === null ? null : `@${model.username}`, model.homeCity]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
  return (
    <View
      testID="you-profile-passport"
      style={{
        marginHorizontal: th.space.gutter,
        borderRadius: th.radius.cardLarge + 2,
        padding: th.space.gap16,
        backgroundColor: th.accent.paper,
        experimental_backgroundImage: GUILLOCHE,
        boxShadow: th.shadow.card,
        gap: th.space.gap14,
      }}
    >
      <View style={{ flexDirection: 'row', gap: th.space.gap14, alignItems: 'center' }}>
        <PremiumProfileFace
          avatar={model.avatar}
          name={model.name}
          ring={model.ring}
          photoUri={photoUri}
          size={FACE}
        />
        <View style={{ flex: 1, gap: th.space.gap4 }}>
          <Text
            variant="largeTitle"
            color={PASS_PAPER.ink}
            numberOfLines={1}
            accessibilityRole="header"
            testID="you-profile-name"
          >
            {model.name}
          </Text>
          {handle === '' ? null : (
            <Text variant="label" color={PASS_PAPER.label} testID="you-profile-handle">
              {handle}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: th.space.gap6, marginTop: th.space.gap4 }}>
            {model.passPlus ? (
              <Pressable
                onPress={onPassPlus}
                disabled={onPassPlus === undefined}
                accessibilityRole="button"
                testID="you-profile-pass-plus"
              >
                {/* eslint-disable-next-line lingui/no-unlocalized-strings -- the Pass+ brand mark, never copy. */}
                <Tag label="Pass+" color={th.accent.sun} rotate={-3} />
              </Pressable>
            ) : null}
            {model.ring === null ? null : <TierLabel tier={model.ring} />}
          </View>
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          paddingTop: th.space.gap12,
          borderTopWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: PASS_PAPER.rule,
        }}
      >
        <Stat
          value={model.stats.trips}
          label={statLabel('trips', model.stats.trips)}
          testID="you-profile-stat-trips"
        />
        <Stat
          value={model.stats.countries}
          label={statLabel('countries', model.stats.countries)}
          testID="you-profile-stat-countries"
        />
        <Stat
          value={model.stats.critters}
          label={statLabel('critters', model.stats.critters)}
          testID="you-profile-stat-critters"
        />
      </View>
      <Text
        variant="mono"
        color={PASS_PAPER.label}
        numberOfLines={2}
        accessibilityLabel={t({ id: 'you.premium.mrz', message: 'Machine-readable line' })}
        testID="you-profile-mrz"
      >
        {`${model.mrz}\n${t({ id: 'you.premium.since', message: `SINCE ${model.sinceYear}` })}`}
      </Text>
    </View>
  );
}
