/**
 * A recap link (`/rc/{token}`) opened in the app (undesigned). A traveller of the trip lands on
 * their own recap; anyone else sees the public-safe recap the web page shows: the place, the
 * month, the totals, the places on the trail and first names. A link that was switched off says so
 * and leads Home; with no answer it offers another try.
 */
import type { PublicRecap } from '@cp/domain';
import { format } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { Card } from '@/ui/cards/Card';
import { ListCard } from '@/ui/cards/ListCard';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { recapRoutes } from '../routes';
import { useRecapLinkLanding } from './use-recap-link';

const EMPTY_STICKER = 180;
const HOME_ROUTE = '/';

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.size.gutter,
    paddingTop: th.space['12'],
    paddingBottom: th.space['32'],
    gap: th.space['16'],
  },
}));

/** "October 2026", from the month and year alone; null when the recap carries no month. */
export function recapMonth(recap: PublicRecap, locale: string): string | null {
  if (recap.travel_month === null) return null;
  const date = new Date(Date.UTC(recap.travel_year ?? 2000, recap.travel_month - 1, 1));
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    ...(recap.travel_year === null ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(date);
}

export function PublicRecapView({ recap }: { readonly recap: PublicRecap }) {
  const { t } = useLingui();
  const locale = useLocale();
  const place = recap.destination_name;
  const month = recapMonth(recap, locale);
  const names = new Intl.ListFormat(locale, { type: 'conjunction' }).format(recap.crew_names);
  const days = recap.days ?? 0;
  const travellers = recap.travellers ?? 0;
  const critters = recap.critters_found ?? 0;
  const more = recap.places_count - recap.places.length;
  const distance =
    recap.distance_m !== null && recap.distance_m > 0
      ? format.distance(
          locale,
          Math.max(1000, Math.round(recap.distance_m / 1000) * 1000),
          'metric',
        )
      : null;
  return (
    <Stack gap="16" testID="recap-link-public">
      <Stack gap="4">
        <Text variant="eyebrow">
          {month === null
            ? t({ id: 'recap.link.eyebrow', message: 'Trip recap' })
            : t({ id: 'recap.link.eyebrowWhen', message: `Trip recap · ${month}` })}
        </Text>
        <Text variant="displayHero" accessibilityRole="header">
          {place === null
            ? t({ id: 'recap.link.titleNoPlace', message: 'The trip, the recap' })
            : t({ id: 'recap.link.title', message: `${place}, the recap` })}
        </Text>
        {recap.crew_names.length > 0 ? (
          <Text variant="body" testID="recap-link-names">
            {t({ id: 'recap.link.names', message: `With ${names}` })}
          </Text>
        ) : null}
      </Stack>
      <Row gap="6" wrap>
        {days > 0 ? (
          <InfoPill>
            {t({
              id: 'recap.link.days',
              message: plural(days, { one: '# day', other: '# days' }),
            })}
          </InfoPill>
        ) : null}
        {travellers > 1 ? (
          <InfoPill>{t({ id: 'recap.link.crew', message: `Crew of ${travellers}` })}</InfoPill>
        ) : null}
        {distance === null ? null : (
          <InfoPill>
            {recap.distance_estimated
              ? t({ id: 'recap.link.distanceAbout', message: `About ${distance}` })
              : distance}
          </InfoPill>
        )}
        {critters > 0 ? (
          <InfoPill>
            {t({
              id: 'recap.link.critters',
              message: plural(critters, { one: '# critter found', other: '# critters found' }),
            })}
          </InfoPill>
        ) : null}
      </Row>
      {recap.places.length > 0 ? (
        <Stack gap="8" testID="recap-link-places">
          <Text variant="eyebrow">{t({ id: 'recap.link.places', message: 'On the trail' })}</Text>
          {recap.places.map((spot, index) => (
            <ListCard key={`${String(index)}-${spot.name}`} title={spot.name} />
          ))}
          {more > 0 ? (
            <Text variant="caption">
              {t({
                id: 'recap.link.morePlaces',
                message: plural(more, { one: 'and # more place', other: 'and # more places' }),
              })}
            </Text>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}

export function RecapLinkScreen({ token }: { readonly token: string }) {
  const { t } = useLingui();
  const styles = useStyles();
  const { state, retry } = useRecapLinkLanding(token);
  const mine = state.kind === 'mine' ? state.tripId : null;
  useEffect(() => {
    if (mine !== null) router.replace(recapRoutes.summary(mine));
  }, [mine]);
  const guide = guideSticker(null);
  const sticker = <Sticker kind={guide.kind} name={guide.name} size={EMPTY_STICKER} pose="wave" />;
  return (
    <Scaffold testID={`recap-link-${state.kind}`}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackEyebrow label={t({ id: 'recap.link.back', message: 'Home' })} />
        {state.kind === 'public' ? <PublicRecapView recap={state.recap} /> : null}
        {state.kind === 'loading' || state.kind === 'mine' ? (
          <Skeleton preset="card" repeat={2} />
        ) : null}
        {state.kind === 'gone' || state.kind === 'unreachable' ? (
          <Card tone="yellow" halftone radius="cardBig">
            {state.kind === 'gone' ? (
              <EmptyState
                guide="tokek"
                guideName={guide.name}
                sticker={sticker}
                title={t({ id: 'recap.link.gone', message: 'This recap is no longer shared' })}
                line={t({
                  id: 'recap.link.goneLine',
                  message: 'The crew switched this link off. Ask whoever sent it for a new one.',
                })}
                action={{
                  label: t({ id: 'recap.link.goneAction', message: 'Go to Home' }),
                  onPress: () => router.navigate(HOME_ROUTE),
                }}
              />
            ) : (
              <EmptyState
                guide="tokek"
                guideName={guide.name}
                sticker={sticker}
                title={t({ id: 'recap.link.missing', message: 'This recap is out of reach' })}
                line={t({ id: 'recap.link.missingLine', message: 'It needs a signal to open.' })}
                action={{
                  label: t({ id: 'recap.link.retry', message: 'Try again' }),
                  onPress: retry,
                }}
              />
            )}
          </Card>
        ) : null}
      </ScrollView>
    </Scaffold>
  );
}
