/**
 * Home's undesigned modes, built from existing components (logged in docs/undesigned-states.md):
 * - no trip: the guide's line, PITCH A PLACE and the last trip's stamp;
 * - in trip: the next-up card becomes "TODAY · DAY n OF N", opens the trip hub, and carries the
 *   next stop and one button into the day (drawn by the next-up card itself);
 * The post-trip card is ./post-trip-card.tsx.
 */
import type { HomeTripInput } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';

import { tripDay } from './format';
import { NextUpCard } from './next-up-card';
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
  const tokek = guideSticker('tokek');
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

/** A trip the server marked under way: the same card Home shows from the first day's midnight. */
export function InTripCard({ trip, now }: { readonly trip: HomeTripInput; readonly now: Date }) {
  return <NextUpCard trip={trip} now={() => now} />;
}
