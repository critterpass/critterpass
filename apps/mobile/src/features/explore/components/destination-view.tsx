/**
 * The destination guide page, drawn from plain values: the hero, WHEN TO GO with the chosen month
 * priced for the crew, the guide's first-timer picks, and the two ways forward pinned to the
 * bottom. A place the guest guide covers says how much is covered instead of drawing empty cards.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextLink } from '@/ui/buttons/TextLink';
import { ListCard } from '@/ui/cards/ListCard';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Skeleton } from '@/ui/states/Skeleton';
import { FOOTER_FADE_PT, FooterFade } from '@/ui/surface/FooterFade';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { LegendChip, MonthBarModel } from '../destination-model';
import { DestHero, type DestHeroProps } from './dest-hero';
import { DestinationActions, type DestinationActionsProps } from './destination-actions';
import { MonthBars } from './month-bars';
import { MonthPanel, type MonthPanelProps } from './month-panel';
import { PicksRow, type PickCard } from './picks-row';

export interface DestinationViewProps {
  readonly hero: DestHeroProps;
  /** The page's facts are still on their way (nothing saved to show yet). */
  readonly loading: boolean;
  readonly offline: boolean;
  /**
   * `limited`: a place nobody has checked (the guest guide's, or its own guide still learning it) with no curve or picks; `writing`: a guide's own place whose
   * curve and picks are not written yet; `unavailable`: they did not load.
   */
  readonly notice: 'limited' | 'writing' | 'unavailable' | null;
  readonly months: {
    readonly bars: readonly MonthBarModel[];
    readonly legend: readonly LegendChip[];
    readonly selected: number | null;
    readonly onSelect: (month: number) => void;
    readonly panel: MonthPanelProps | null;
  } | null;
  readonly picks: readonly PickCard[];
  readonly onOpenPick?: ((pick: PickCard) => void) | undefined;
  /** Opens the destination's map. */
  readonly onMap?: (() => void) | undefined;
  /** Opens the crews' shared plans for this place; absent while that screen is not in the app. */
  readonly onCrewPlans?: (() => void) | undefined;
  readonly actions: DestinationActionsProps;
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space['20'], paddingTop: t.space['16'] },
  inset: { paddingHorizontal: t.size.gutter },
  card: {
    marginHorizontal: t.size.gutter,
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
    gap: t.space['12'],
  },
  footer: { paddingHorizontal: t.size.gutter, paddingTop: t.space['8'] },
}));

export function DestinationView(props: DestinationViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const { hero, months } = props;
  const guide = hero.guide;
  return (
    <Scaffold edges={[]} testID="explore-destination">
      <ScrollView contentContainerStyle={{ paddingBottom: FOOTER_FADE_PT + theme.space['8'] }}>
        <DestHero {...hero} />
        <View style={styles.body}>
          {props.offline ? (
            <View style={styles.inset}>
              <OfflinePill testID="explore-offline" />
            </View>
          ) : null}
          {props.loading ? (
            <View style={styles.inset} testID="explore-loading">
              <Skeleton
                preset="card"
                label={t({ id: 'explore.dest.loading', message: 'Loading the guide' })}
              />
            </View>
          ) : null}
          {months === null ? null : (
            <View style={styles.card}>
              <Row justify="space-between" align="center" gap="8">
                <Text variant="eyebrow" color={theme.semantic.text.primary}>
                  {upper(t({ id: 'explore.months.title', message: 'When to go' }), locale)}
                </Text>
                <Text variant="eyebrow">
                  {upper(t({ id: 'explore.months.subtitle', message: 'Crowds by month' }), locale)}
                </Text>
              </Row>
              <MonthBars
                bars={months.bars}
                legend={months.legend}
                selected={months.selected}
                onSelect={months.onSelect}
              />
              {months.panel === null ? null : <MonthPanel {...months.panel} />}
            </View>
          )}
          {props.onMap === undefined ? null : (
            <View style={styles.inset}>
              <ListCard
                title={t({ id: 'explore.dest.map', message: `Map of ${hero.name}` })}
                subtitle={t({
                  id: 'explore.dest.mapBody',
                  message: 'Places, search and what is open now',
                })}
                leading={<Icon name="pin" size={22} decorative />}
                chevron
                onPress={props.onMap}
                testID="explore-open-map"
              />
            </View>
          )}
          {props.picks.length === 0 ? null : (
            <View style={{ gap: theme.space['12'] }}>
              <Row justify="space-between" align="center" gap="8" style={styles.inset}>
                <View style={{ flex: 1 }}>
                  <Text variant="eyebrow">
                    {upper(
                      t({
                        id: 'explore.picks.title',
                        message: `${guide.name}'s first-timer picks`,
                      }),
                      locale,
                    )}
                  </Text>
                </View>
                {props.onCrewPlans === undefined ? null : (
                  <TextLink
                    label={upper(
                      t({ id: 'explore.picks.crewPlans', message: 'Crew plans ›' }),
                      locale,
                    )}
                    onPress={props.onCrewPlans}
                    testID="explore-crew-plans"
                  />
                )}
              </Row>
              <PicksRow picks={props.picks} onOpen={props.onOpenPick} accent={guide.colour} />
            </View>
          )}
          {props.notice === 'writing' ? (
            <View style={styles.card} testID="explore-writing">
              <Text variant="body">
                {t({
                  id: 'explore.dest.writing',
                  message: `${guide.name} is still writing up ${hero.name}: the picks and the month-by-month crowds land here. The places are already on the map.`,
                })}
              </Text>
            </View>
          ) : null}
          {props.notice === 'unavailable' ? (
            <View style={styles.card} testID="explore-unavailable">
              <Text variant="body">
                {t({
                  id: 'explore.dest.unavailable',
                  message: `${guide.name}'s notes on ${hero.name} didn't load. They'll show up once this phone is back online.`,
                })}
              </Text>
            </View>
          ) : null}
          {props.notice === 'limited' ? (
            <View style={styles.card} testID="explore-limited">
              <Text variant="eyebrow">
                {upper(
                  t({
                    id: 'explore.limited.title',
                    message: `What ${guide.name} knows so far`,
                  }),
                  locale,
                )}
              </Text>
              <Text variant="body">
                {guide.learning
                  ? t({
                      id: 'explore.learning.body',
                      message: `${guide.name} is still learning ${hero.name}, and nobody has checked the picks here yet, so the month-by-month crowds and the picks aren't written. Flights, money and the best months are covered, and ${guide.name} plans the trip all the same.`,
                    })
                  : t({
                      id: 'explore.limited.body',
                      message: `No guide lives in ${hero.name} yet, so the month-by-month crowds and the picks aren't written. Flights, money and the best months are covered, and ${guide.name} plans the trip all the same.`,
                    })}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <FooterFade />
      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.space['12'] }]}>
        <DestinationActions {...props.actions} />
      </View>
    </Scaffold>
  );
}
