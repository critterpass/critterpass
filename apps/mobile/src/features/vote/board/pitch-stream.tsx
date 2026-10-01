/**
 * The guide's pitch card (3b-3) as it streams: the sticker slaps in first, then the chips (price
 * each from the crew's home airport, flight hours, best months, an event), the headline, the
 * reasons with the avatars of the crewmates they match, and the guide's line, each section fading
 * in as it arrives. Missing parts show a skeleton while the stream is still running; a failed
 * stream offers a retry; with no fare data the price chip says prices are pending.
 */
import type { PitchChip, PitchReason } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { patterns } from '@/motion';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Icon } from '@/ui/icons/Icon';
import type { DoodleName } from '@/ui/icons/generated';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { LiveSticker } from '@/ui/people/LiveSticker';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { stackOf, type Person } from '../data/use-people';
import { FadeSection } from './fade-section';
import type { PitchState } from '../data/use-pitch-stream';
import { flightHours, guideOr, money, monthShort, upper } from '../format';

const TONES = {
  tokek: 'yellow',
  pon: 'orange',
  lundi: 'blue',
  ajo: 'pink',
  sardi: 'green',
  paco: 'cream',
  chava: 'red',
} as const;

const TAG_ICONS: Readonly<Record<string, DoodleName>> = {
  FOODIE: 'food',
  FOOD: 'food',
  BEACHES: 'wave',
  SURF: 'wave',
  TEMPLES: 'temple',
  HISTORY: 'temple',
  ARCHITECTURE: 'temple',
  PHOTOGRAPHY: 'camera',
  NIGHTLIFE: 'star',
  NATURE: 'volcano',
  HIKING: 'volcano',
  MARKETS: 'wallet',
  SHOPPING: 'wallet',
};

function useChipText(): (chip: PitchChip) => string {
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  return (chip) => {
    switch (chip.kind) {
      case 'price':
        return upper(
          t({
            id: 'vote.pitch.chipPrice',
            message: `${money(locale, chip.amount_minor, chip.currency)} each`,
          }),
          locale,
        );
      case 'flight':
        return upper(
          t({
            id: 'vote.pitch.chipFlight',
            message: `${flightHours(chip.minutes)}h from ${chip.origin}`,
          }),
          locale,
        );
      case 'best_months':
        return upper(
          t({
            id: 'vote.pitch.chipBest',
            message: `Best: ${chip.months.map((month) => monthShort(locale, month)).join(' · ')}`,
          }),
          locale,
        );
      case 'event':
        return upper(chip.name, locale);
      case 'prices_pending':
        return upper(t({ id: 'vote.pitch.chipPending', message: 'Prices pending' }), locale);
    }
  };
}

function ReasonRow({
  reason,
  people,
}: {
  readonly reason: PitchReason;
  readonly people: ReadonlyMap<string, Person>;
}) {
  const theme = useTheme();
  return (
    <Row gap="10" align="center">
      <Icon
        name={TAG_ICONS[reason.tag ?? ''] ?? 'spark'}
        size={24}
        color={theme.semantic.text.onAccent}
      />
      <Text variant="rowTitle" color={theme.semantic.text.onAccent} style={{ flex: 1 }}>
        {reason.text}
      </Text>
      {reason.member_ids.length > 0 ? (
        <AvatarStack members={stackOf(people, reason.member_ids)} size="sm" max={3} />
      ) : null}
    </Row>
  );
}

export interface PitchCardProps {
  readonly state: PitchState;
  readonly people: ReadonlyMap<string, Person>;
  readonly onRetry: () => void;
}

export function PitchCard({ state, people, onRetry }: PitchCardProps) {
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const chipText = useChipText();
  const guideId = guideOr(state.sticker?.guide);
  const guide = GUIDE_STICKERS[guideId];
  const slap = patterns.useSlap({ active: state.sticker !== null, direction: -1 });
  const streaming = state.phase === 'streaming';
  const ink = theme.semantic.text.onAccent;
  if (state.phase === 'error' && state.headline === null) {
    return (
      <Card tone="raised" testID="pitch-error">
        <Stack gap="12">
          <Text variant="title">
            {t({ id: 'vote.pitch.errorTitle', message: "The pitch didn't come through" })}
          </Text>
          <Text variant="body">
            {t({ id: 'vote.pitch.errorBody', message: 'Check your connection and ask again.' })}
          </Text>
          <PillButton
            label={t({ id: 'vote.pitch.retry', message: 'Try again' })}
            onPress={onRetry}
            size="sm"
            block={false}
            testID="pitch-retry"
          />
        </Stack>
      </Card>
    );
  }
  const heading = state.sticker === null ? '' : (state.headline ?? state.sticker.name);
  return (
    <Card tone={TONES[guideId]} halftone radius="cardBig" testID="pitch-card">
      <Stack gap="12">
        <Row gap="12" align="center">
          <Animated.View style={slap}>
            {state.sticker === null ? (
              <Skeleton
                preset="card"
                label={t({ id: 'vote.pitch.loading', message: 'The guide is on it' })}
              />
            ) : (
              <LiveSticker kind={guide.kind} name={guide.name} size={88} drawOn={false} />
            )}
          </Animated.View>
          <Stack gap="4" style={{ flex: 1 }}>
            <Text variant="eyebrow" color={ink}>
              {upper(t({ id: 'vote.pitch.byline', message: `${guide.name} pitches` }), i18n.locale)}
            </Text>
            {state.headline === null && streaming ? (
              <Skeleton preset="lines" />
            ) : (
              <FadeSection>
                <Text variant="h1" color={ink} numberOfLines={4} testID="pitch-headline">
                  {upper(heading, i18n.locale)}
                </Text>
              </FadeSection>
            )}
          </Stack>
        </Row>
        {state.chips.length > 0 ? (
          <FadeSection>
            <Row gap="6" wrap testID="pitch-chips">
              {state.chips.map((chip, index) => (
                // An event's name is the guide's own words: one line, cut short when long.
                <InfoPill key={`${chip.kind}-${index}`} oneLine>
                  {chipText(chip)}
                </InfoPill>
              ))}
            </Row>
          </FadeSection>
        ) : null}
        {state.reasons.length > 0 ? (
          <FadeSection>
            <Stack gap="10" testID="pitch-reasons">
              <Text variant="eyebrow" color={ink}>
                {upper(
                  t({ id: 'vote.pitch.why', message: 'Why your crew might bite' }),
                  i18n.locale,
                )}
              </Text>
              {state.reasons.map((reason, index) => (
                <ReasonRow key={index} reason={reason} people={people} />
              ))}
            </Stack>
          </FadeSection>
        ) : streaming ? (
          <Skeleton preset="lines" />
        ) : null}
        {state.quote === null ? null : (
          <FadeSection>
            <Text variant="voice" color={ink} testID="pitch-quote">
              {state.quote}
            </Text>
          </FadeSection>
        )}
        {state.phase === 'error' ? (
          <View>
            <PillButton
              label={t({ id: 'vote.pitch.retry', message: 'Try again' })}
              onPress={onRetry}
              size="sm"
              block={false}
              testID="pitch-retry"
            />
          </View>
        ) : null}
      </Stack>
    </Card>
  );
}
