/**
 * A recap link opened in the app, in the premium look (undesigned; built from the recap page's
 * kit): a traveller of the trip lands on their own recap; anyone else sees the public-safe recap
 * (the place, the month, the totals as tags, the places on the trail and first names). A link
 * that was switched off says so with the way Home; with no answer it offers another try.
 */
import type { PublicRecap } from '@cp/domain';
import { format } from '@cp/i18n';
import { plural, t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  Button,
  EmptyState,
  ListCard,
  Row,
  Skeleton,
  Tag,
  Text,
  enterTransition,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { recapMonth } from '../link/recap-link';
import { useRecapLinkLanding } from '../link/use-recap-link';
import { recapRoutes } from '../routes';

const HOME_ROUTE = '/';

function totals(recap: PublicRecap, locale: string): string[] {
  const days = recap.days ?? 0;
  const travellers = recap.travellers ?? 0;
  const critters = recap.critters_found ?? 0;
  const distance =
    recap.distance_m !== null && recap.distance_m > 0
      ? format.distance(
          locale,
          Math.max(1000, Math.round(recap.distance_m / 1000) * 1000),
          'metric',
        )
      : null;
  return [
    ...(days > 0
      ? [t({ id: 'recap.link.days', message: plural(days, { one: '# day', other: '# days' }) })]
      : []),
    ...(travellers > 1 ? [t({ id: 'recap.link.crew', message: `Crew of ${travellers}` })] : []),
    ...(distance === null
      ? []
      : [
          recap.distance_estimated
            ? t({ id: 'recap.link.distanceAbout', message: `About ${distance}` })
            : distance,
        ]),
    ...(critters > 0
      ? [
          t({
            id: 'recap.link.critters',
            message: plural(critters, { one: '# critter found', other: '# critters found' }),
          }),
        ]
      : []),
  ];
}

function PublicRecap({ recap }: { readonly recap: PublicRecap }) {
  const locale = useLocale();
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const place = recap.destination_name;
  const month = recapMonth(recap, locale);
  const names = new Intl.ListFormat(locale, { type: 'conjunction' }).format(recap.crew_names);
  const more = recap.places_count - recap.places.length;
  const accents = [th.accent.sun, th.accent.mint, th.accent.sky, th.accent.pink];
  return (
    <Animated.View
      entering={enterTransition(reduced)}
      style={{ gap: 18 }}
      testID="recap-link-public"
    >
      <View style={{ gap: 6 }}>
        <Text variant="tier" tone="muted">
          {month === null
            ? t({ id: 'recap.link.eyebrow', message: 'Trip recap' })
            : t({ id: 'recap.link.eyebrowWhen', message: `Trip recap · ${month}` })}
        </Text>
        <Text variant="display" accessibilityRole="header" singleLine={false}>
          {place === null
            ? t({ id: 'recap.link.titleNoPlace', message: 'The trip, the recap' })
            : t({ id: 'recap.link.title', message: `${place}, the recap` })}
        </Text>
        {recap.crew_names.length > 0 ? (
          <Text variant="rowText" tone="inkSecondary" testID="recap-link-names">
            {t({ id: 'recap.link.names', message: `With ${names}` })}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {totals(recap, locale).map((label, index) => (
          <Tag key={label} label={label} color={accents[index % accents.length]} />
        ))}
      </View>
      {recap.places.length > 0 ? (
        <View style={{ gap: 8 }} testID="recap-link-places">
          <Text variant="tier" tone="muted" style={{ marginLeft: 6 }}>
            {t({ id: 'recap.link.places', message: 'On the trail' })}
          </Text>
          <ListCard>
            {recap.places.map((spot, index) => (
              <Row key={`${String(index)}-${spot.name}`} title={spot.name} />
            ))}
          </ListCard>
          {more > 0 ? (
            <Text variant="captionMuted" style={{ marginLeft: 6 }}>
              {t({
                id: 'recap.link.morePlaces',
                message: plural(more, { one: 'and # more place', other: 'and # more places' }),
              })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

export function PremiumRecapLinkScreen({ token }: { readonly token: string }) {
  const th = usePremiumTheme();
  const { state, retry } = useRecapLinkLanding(token);
  const mine = state.kind === 'mine' ? state.tripId : null;
  useEffect(() => {
    if (mine !== null) router.replace(recapRoutes.summary(mine));
  }, [mine]);
  const guide = guideSticker(null);
  const critter = { kind: guide.kind, name: guide.name };
  return (
    <PushScreen
      {...(router.canGoBack()
        ? {}
        : {
            action: {
              key: 'home',
              label: t({ id: 'recap.link.back', message: 'Home' }),
              sfSymbol: 'house',
              glyph: 'home',
              onPress: () => router.navigate(HOME_ROUTE),
            },
          })}
      title={t({ id: 'recap.link.eyebrow', message: 'Trip recap' })}
      backLabel={t({ id: 'recap.link.back', message: 'Home' })}
      testID={`recap-link-${state.kind}`}
    >
      <View style={{ paddingHorizontal: th.space.gutter, paddingTop: 8, gap: 16 }}>
        {state.kind === 'public' ? <PublicRecap recap={state.recap} /> : null}
        {state.kind === 'loading' || state.kind === 'mine' ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={34} width="70%" />
            <Skeleton height={160} tone="block" radius={22} />
          </View>
        ) : null}
        {state.kind === 'gone' ? (
          <EmptyState
            critter={critter}
            check={false}
            title={t({ id: 'recap.link.gone', message: 'This recap is no longer shared' })}
            line={t({
              id: 'recap.link.goneLine',
              message: 'The crew switched this link off. Ask whoever sent it for a new one.',
            })}
            action={
              <Button
                label={t({ id: 'recap.link.goneAction', message: 'Go to Home' })}
                onPress={() => router.navigate(HOME_ROUTE)}
              />
            }
          />
        ) : null}
        {state.kind === 'unreachable' ? (
          <EmptyState
            critter={critter}
            check={false}
            title={t({ id: 'recap.link.missing', message: 'This recap is out of reach' })}
            line={t({ id: 'recap.link.missingLine', message: 'It needs a signal to open.' })}
            action={
              <Button label={t({ id: 'recap.link.retry', message: 'Try again' })} onPress={retry} />
            }
          />
        ) : null}
      </View>
    </PushScreen>
  );
}
