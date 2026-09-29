/**
 * Home's undesigned modes, built from existing components (logged in docs/undesigned-states.md):
 * - no trip: the guide's line, PITCH A PLACE and the last trip's stamp;
 * - in trip: the next-up card becomes "TODAY · DAY n" and opens the trip hub;
 * - post trip: "{PLACE} RECAP" opens the recap for two weeks after the last day.
 */
import { formatCountdown, type HomeTripInput } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { useLocale } from '@/lib/i18n/use-locale';
import { useLoop } from '@/motion/use-loop';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { CountdownCard } from '@/ui/cards/CountdownCard';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';
import Animated from 'react-native-reanimated';

import { guideOr, guideTone, tripDay } from './format';
import { NEXT_UP_STICKER } from './next-up-card';
import { homeRoutes } from './routes';

function go(href: ReturnType<typeof homeRoutes.tripHub>): (() => void) | undefined {
  return href === undefined ? undefined : () => router.push(href);
}

export function NoTripCard({
  crewId,
  lastTrip,
}: {
  readonly crewId: string;
  readonly lastTrip: HomeTripInput | null;
}) {
  const { t } = useLingui();
  const locale = useLocale();
  const tokek = GUIDE_STICKERS.tokek;
  const pitch = go(homeRoutes.pitch(crewId));
  const last =
    lastTrip?.destinationName == null
      ? null
      : lastTrip.startDate === null
        ? lastTrip.destinationName
        : `${lastTrip.destinationName} · ${tripDay(locale, lastTrip.startDate)}`;
  return (
    <Card testID="home-no-trip">
      <Stack gap="16">
        <GuideLine
          guide="tokek"
          name={tokek.name}
          line={t({
            id: 'home.noTrip.line',
            message: "Nothing on the calendar yet. Pitch a place and I'll get the vote going.",
          })}
          sticker={<Sticker kind={tokek.kind} name={tokek.name} size={48} pose="think" />}
        />
        {last === null ? null : (
          <InfoPill variant="outline" testID="home-last-trip">
            {upper(t({ id: 'home.noTrip.last', message: `Last trip · ${last}` }), locale)}
          </InfoPill>
        )}
        <PillButton
          label={upper(t({ id: 'home.noTrip.pitch', message: 'Pitch a place' }), locale)}
          onPress={pitch ?? (() => undefined)}
          disabled={pitch === undefined}
          testID="home-pitch"
        />
      </Stack>
    </Card>
  );
}

export function InTripCard({ trip, now }: { readonly trip: HomeTripInput; readonly now: Date }) {
  const { t } = useLingui();
  const locale = useLocale();
  const bob = useLoop('bob');
  const guide = guideOr(trip.guideId);
  const sticker = GUIDE_STICKERS[guide];
  const start = trip.countdownTargetAt === null ? now : new Date(trip.countdownTargetAt);
  const display = formatCountdown(now, start, { startDate: trip.startDate, tz: trip.tz });
  const day = display.kind === 'day' ? display.day : 1;
  const place =
    trip.destinationName ?? t({ id: 'home.nextUp.untitled', message: 'Your next trip' });
  const open = go(homeRoutes.tripHub(trip.id));
  return (
    <CountdownCard
      testID="home-in-trip"
      tone={guideTone(guide)}
      eyebrow={upper(t({ id: 'home.inTrip.eyebrow', message: `Today · Day ${day}` }), locale)}
      title={upper(place, locale)}
      stickerSize={NEXT_UP_STICKER}
      sticker={
        <Animated.View style={bob}>
          <Sticker kind={sticker.kind} name={sticker.name} size={NEXT_UP_STICKER} pose="cheer" />
        </Animated.View>
      }
      meta={
        <InfoPill variant="outline">
          {upper(t({ id: 'home.inTrip.open', message: 'Open the trip' }), locale)}
        </InfoPill>
      }
      {...(open === undefined ? {} : { onPress: open })}
    />
  );
}

export function PostTripCard({ trip }: { readonly trip: HomeTripInput }) {
  const { t } = useLingui();
  const locale = useLocale();
  const guide = guideOr(trip.guideId);
  const sticker = GUIDE_STICKERS[guide];
  const place = trip.destinationName ?? t({ id: 'home.postTrip.fallback', message: 'Trip' });
  const open = go(homeRoutes.recap(trip.id));
  return (
    <CountdownCard
      testID="home-post-trip"
      tone={guideTone(guide)}
      eyebrow={upper(t({ id: 'home.postTrip.eyebrow', message: "How'd it go?" }), locale)}
      title={upper(t({ id: 'home.postTrip.title', message: `${place} recap` }), locale)}
      stickerSize={NEXT_UP_STICKER}
      sticker={
        <Sticker kind={sticker.kind} name={sticker.name} size={NEXT_UP_STICKER} pose="hop" />
      }
      meta={
        <InfoPill variant="outline">
          {upper(t({ id: 'home.postTrip.open', message: 'See the recap' }), locale)}
        </InfoPill>
      }
      {...(open === undefined ? {} : { onPress: open })}
    />
  );
}
