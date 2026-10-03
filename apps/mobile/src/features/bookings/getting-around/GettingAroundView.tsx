/**
 * Getting around (3h-3), truthful: the leg on a map, the ride card (Grab's own estimate, else the
 * ride apps as links) or the pre-booked transfer, the estimated journey after "I'm in the car",
 * the phrase card for the driver and today's later legs with OPEN GRAB and LOG IT.
 */
/* eslint-disable lingui/no-unlocalized-strings -- the SHOW mode route path. */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import type { GuideId } from '@/ui/people/GuideLine';
import { BackButton } from '@/ui/shell/BackButton';
import { EmptyState } from '@/ui/states/EmptyState';
import { Sticker } from '@/ui/sticker/Sticker';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { PhraseCard } from '@/ui/trip/PhraseCard';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { GrabEstimateCard, type GrabEstimateCardProps } from './GrabEstimateCard';
import { JourneyProgress, type JourneyProgressProps } from './JourneyProgress';
import { LaterTodayRow, type LaterTodayRowProps } from './LaterTodayRow';
import { RouteMap, type RouteMapProps } from './RouteMap';
import { TransferCard, type TransferCardProps } from './TransferCard';

export interface GettingAroundViewProps {
  readonly status: 'loading' | 'no_trip' | 'no_place' | 'ready';
  /** "AIRPORT → VILLA · 1H 05M". */
  readonly header: string | null;
  readonly map: Omit<RouteMapProps, 'height'> | null;
  readonly transfer: TransferCardProps | null;
  readonly ride: GrabEstimateCardProps | null;
  readonly journey: JourneyProgressProps | null;
  readonly phrase: {
    readonly phrase: string;
    readonly lang: string;
    readonly gloss: string;
    readonly eyebrow: string;
  } | null;
  readonly later: readonly (LaterTodayRowProps & { readonly key: string })[];
  readonly note?: string | null;
  readonly guide: { readonly id: GuideId; readonly name: string };
  readonly onBack?: () => void;
}

const MAP_HEIGHT = 380;

const useStyles = makeStyles((t) => ({
  header: {
    position: 'absolute',
    left: t.space['12'],
    right: t.size.gutter,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  body: { paddingHorizontal: t.size.gutter, gap: t.space['20'], paddingTop: t.space['20'] },
}));

export function GettingAroundView(props: GettingAroundViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { t } = useLingui();
  const back = <BackButton {...(props.onBack ? { onPress: props.onBack } : {})} />;
  if (props.status !== 'ready') {
    return (
      <Scaffold variant="dark" testID={`getting-around-${props.status}`}>
        <View style={{ padding: theme.space['12'] }}>{back}</View>
        {props.status === 'loading' ? (
          <Skeleton
            preset="photo"
            label={t({ id: 'suppliers.around.loading', message: 'Loading your day' })}
          />
        ) : (
          <EmptyState
            title={
              props.status === 'no_trip'
                ? t({ id: 'suppliers.around.noTrip', message: 'No trip under way' })
                : t({ id: 'suppliers.around.noPlace', message: 'Nothing left to get to today' })
            }
            guide={props.guide.id}
            guideName={props.guide.name}
            sticker={
              <Sticker
                kind={GUIDE_STICKERS[props.guide.id].kind}
                name={GUIDE_STICKERS[props.guide.id].name}
                pose="sleep"
                size={120}
              />
            }
            line={t({
              id: 'suppliers.around.emptyBody',
              message: 'Rides show up here for the places on your plan.',
            })}
          />
        )}
      </Scaffold>
    );
  }
  return (
    <Scaffold variant="dark" edges={['bottom']} testID="getting-around">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + theme.space['32'] }}>
        <View>
          {props.map ? (
            <RouteMap {...props.map} height={MAP_HEIGHT} />
          ) : (
            <View style={{ height: insets.top + 64 }} />
          )}
          <Row style={[styles.header, { top: insets.top + theme.space['8'] }]}>
            {back}
            {props.header ? (
              <Text
                variant="label"
                style={{ flexShrink: 1, textAlign: 'right' }}
                testID="getting-around-header"
              >
                {upper(props.header, locale)}
              </Text>
            ) : null}
          </Row>
        </View>
        <View style={styles.body}>
          {props.note ? (
            <Text
              variant="bodySm"
              color={theme.semantic.text.secondary}
              testID="getting-around-note"
            >
              {props.note}
            </Text>
          ) : null}
          {props.transfer ? <TransferCard {...props.transfer} /> : null}
          {props.ride ? <GrabEstimateCard {...props.ride} /> : null}
          {props.journey ? <JourneyProgress {...props.journey} /> : null}
          {props.phrase ? (
            <Pressable
              // On the accessible view itself: iOS hides the ids of the card inside it.
              testID="getting-around-phrase"
              accessibilityRole="button"
              accessibilityHint={t({
                id: 'suppliers.around.showHint',
                message: 'Opens the card full screen to show the driver',
              })}
              onPress={() => {
                const phrase = props.phrase;
                if (phrase)
                  router.push({
                    pathname: '/guide/phrase',
                    params: { phrase: phrase.phrase, lang: phrase.lang, gloss: phrase.gloss },
                  });
              }}
            >
              <PhraseCard
                phrase={props.phrase.phrase}
                lang={props.phrase.lang}
                translation={`“${props.phrase.gloss}”`}
                eyebrow={props.phrase.eyebrow}
              />
            </Pressable>
          ) : null}
          {props.later.length > 0 ? (
            <Stack gap="12">
              <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                {upper(t({ id: 'suppliers.later.title', message: 'Later today' }), locale)}
              </Text>
              {props.later.map(({ key, ...row }) => (
                <LaterTodayRow key={key} {...row} />
              ))}
            </Stack>
          ) : null}
        </View>
      </ScrollView>
    </Scaffold>
  );
}
