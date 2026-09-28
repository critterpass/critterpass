/**
 * 3a-11's found card: whose crew the code belongs to, its name, the trip's place and dates, the
 * per-person estimate, who is already in and which guide is guiding. It unfolds on arrival
 * (460 ms) and the guide sticker lands on it (520 ms).
 */
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { formatMoney, money } from '@cp/cost-engine';
import { format, upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { GUIDE_AVATAR_IDS, GUIDE_STICKERS, type GuideAvatarId } from '@/ui/avatar/guides';
import { Card } from '@/ui/cards/Card';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import type { TicketModel } from './ticket-model';

const UNFOLD_MS = 460;
const LAND_MS = 520;

const useStyles = makeStyles((th) => ({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
  people: { flexDirection: 'row', alignItems: 'center', gap: th.space['8'] },
  guide: { position: 'absolute', end: th.space['12'], top: -th.space['24'] },
}));

function guideOf(slug: string | null): GuideAvatarId {
  return (GUIDE_AVATAR_IDS as readonly string[]).includes(slug ?? '')
    ? (slug as GuideAvatarId)
    : 'tokek';
}

export function FoundCrewCard({ model }: { readonly model: TicketModel }) {
  const styles = useStyles();
  const locale = useLocale();
  const reduced = useReducedImpactMotion();
  const unfold = useSharedValue(reduced ? 1 : 0);
  const land = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    unfold.value = withTiming(1, { duration: UNFOLD_MS, easing: Easing.out(Easing.cubic) });
    land.value = withDelay(
      UNFOLD_MS,
      withTiming(1, { duration: LAND_MS, easing: Easing.out(Easing.back(1.6)) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plays once per found crew.
  }, [reduced]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: unfold.value,
    transform: [{ perspective: 800 }, { rotateX: `${(1 - unfold.value) * -80}deg` }],
  }));
  const guideStyle = useAnimatedStyle(() => ({
    opacity: land.value,
    transform: [{ translateY: (1 - land.value) * -40 }, { rotate: `${(1 - land.value) * 20}deg` }],
  }));

  const guide = GUIDE_STICKERS[guideOf(model.guideSlug)];
  const inviter = model.inviterFirstName ?? '';
  const crew = model.crewName ?? '';
  const count = model.members.length;
  const guideName = guide.name;
  const dates =
    model.tripStart === null || model.tripEnd === null
      ? null
      : format.dateInterval(locale, new Date(model.tripStart), new Date(model.tripEnd), {
          month: 'short',
          day: 'numeric',
        });
  const where = [model.place, dates].filter((part): part is string => part !== null).join(' · ');
  const each =
    model.estimate === null
      ? null
      : formatMoney(money(BigInt(model.estimate.minor), model.estimate.currency), {
          mode: 'local',
          locale,
        });

  return (
    <Animated.View style={cardStyle} testID="invite-found-card">
      <Card tone="yellow">
        <Stack gap="12">
          <Text variant="eyebrow">
            {upper(
              t({ id: 'onboarding.invite.code.found', message: `Found it · ${inviter}’s crew` }),
              locale,
            )}
          </Text>
          <Text variant="displayXl" accessibilityRole="header">
            {upper(crew, locale)}
          </Text>
          <View style={styles.pills}>
            {where === '' ? null : <InfoPill>{upper(where, locale)}</InfoPill>}
            {each === null ? null : (
              <InfoPill variant="outline">
                {upper(t({ id: 'onboarding.invite.code.each', message: `~${each} each` }), locale)}
              </InfoPill>
            )}
          </View>
          <View style={styles.people}>
            <AvatarStack
              members={model.members.map((m, index) => ({
                key: `${index}`,
                name: m.name,
                joinIndex: index,
              }))}
              max={4}
              size="sm"
            />
            <Text variant="bodySm">
              {t({
                id: 'onboarding.invite.code.alreadyIn',
                message: `${count} already in. ${guideName} is guiding.`,
              })}
            </Text>
          </View>
        </Stack>
        <Animated.View style={[styles.guide, guideStyle]} pointerEvents="none">
          <Sticker kind={guide.kind} name={guide.name} size={64} />
        </Animated.View>
      </Card>
    </Animated.View>
  );
}
