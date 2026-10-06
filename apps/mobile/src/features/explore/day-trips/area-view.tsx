/**
 * A day-trip area's page, drawn from plain values: the hero with the base city's guide (an area
 * has none of its own), how to get there and what it costs, the note, the places there, its map
 * for offline, and what stands at the foot for this person: ADD AS A DAY TRIP, the day it is on
 * with CHANGE DAY and REMOVE, or the line that says why not.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Row } from '@/ui/layout/Row';
import { PlanningTag } from '@/ui/planning/planning-tag';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { DestHero, type DestHeroProps } from '../components/dest-hero';
import { PicksRow, type PickCard } from '../components/picks-row';
import type { AreaAction } from './area-model';
import * as copy from './copy';

export interface AreaViewProps {
  readonly hero: Omit<
    DestHeroProps,
    'trailing' | 'saved' | 'onToggleSave' | 'chips' | 'guideArt' | 'bottomRoom'
  >;
  /** "about 3 h 30 by train each way"; null when the link is gone. */
  readonly travel: string | null;
  /** "Full day", before casing. */
  readonly length: string | null;
  /** "about $140 each". */
  readonly cost: string | null;
  readonly note: string | null;
  readonly offline: boolean;
  readonly picks: readonly PickCard[];
  /** The places have not landed yet (and the read has answered). */
  readonly placesComing: boolean;
  readonly onOpenPick?: ((pick: PickCard) => void) | undefined;
  /** The area's map for offline, offered before the day comes. */
  readonly pack?: ReactNode;
  readonly action: AreaAction;
  /** The date of the day it is on, already worded. */
  readonly onDayDate: string | null;
  readonly onAdd: () => void;
  readonly onChangeDay: () => void;
  readonly onRemove: () => void;
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space['20'], paddingTop: t.space['20'] },
  inset: { paddingHorizontal: t.size.gutter, gap: t.space['8'] },
  foot: {
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['12'],
    gap: t.space['8'],
    backgroundColor: t.semantic.bg.base,
  },
}));

export function AreaView(props: AreaViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { i18n } = useLingui();
  const locale = i18n.locale;
  const { action } = props;
  const guide = props.hero.guide;
  const quiet = (line: string, testID: string) => (
    <Text variant="body" color={theme.semantic.text.secondary} testID={testID}>
      {line}
    </Text>
  );
  return (
    <Scaffold edges={[]} testID="day-trip-area">
      <ScrollView contentContainerStyle={{ paddingBottom: theme.space['24'] }}>
        <DestHero {...props.hero} chips={[]} guideArt="ghost" />
        <View style={styles.body}>
          {props.offline ? (
            <View style={styles.inset}>
              <OfflinePill testID="day-trip-offline" />
            </View>
          ) : null}
          <View style={styles.inset} testID="day-trip-facts">
            {props.length === null ? null : <PlanningTag label={upper(props.length, locale)} />}
            {props.travel === null ? null : (
              <Text variant="h3" testID="day-trip-travel">
                {props.travel}
              </Text>
            )}
            {props.cost === null ? null : <Text variant="body">{props.cost}</Text>}
            {props.note === null ? null : (
              <Text variant="body" color={theme.semantic.text.secondary}>
                {props.note}
              </Text>
            )}
            {props.travel === null ? null : (
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {copy.sourcesLine()}
              </Text>
            )}
          </View>
          {props.picks.length > 0 ? (
            <View style={{ gap: theme.space['10'] }}>
              <View style={styles.inset}>
                <Text variant="eyebrow" numberOfLines={2} singleLine={false}>
                  {upper(copy.placesTitle(props.hero.name), locale)}
                </Text>
              </View>
              <PicksRow picks={props.picks} onOpen={props.onOpenPick} accent={guide.colour} />
            </View>
          ) : props.placesComing ? (
            <View style={styles.inset}>
              <Text
                variant="body"
                color={theme.semantic.text.secondary}
                testID="day-trip-places-coming"
              >
                {copy.placesComing(guide.name)}
              </Text>
            </View>
          ) : null}
          {props.pack == null ? null : <View style={styles.inset}>{props.pack}</View>}
        </View>
      </ScrollView>
      <View style={[styles.foot, { paddingBottom: insets.bottom + theme.space['12'] }]}>
        {action.kind === 'add' ? (
          <PillButton label={copy.addAsDayTrip()} onPress={props.onAdd} testID="day-trip-add" />
        ) : action.kind === 'offline' ? (
          <>
            <PillButton
              label={copy.addAsDayTrip()}
              onPress={props.onAdd}
              disabled
              testID="day-trip-add"
            />
            {quiet(copy.offlineLine(), 'day-trip-add-offline')}
          </>
        ) : action.kind === 'onDay' ? (
          <>
            <Text variant="rowTitle" testID="day-trip-on-day">
              {copy.onDayLine(action.dayNo, props.onDayDate)}
            </Text>
            {action.canChange ? (
              <Row gap="16" align="center">
                <PillButton
                  label={copy.changeDay()}
                  variant="secondary"
                  size="sm"
                  block={false}
                  onPress={props.onChangeDay}
                  testID="day-trip-change-day"
                />
                <TextLink label={copy.remove()} onPress={props.onRemove} testID="day-trip-remove" />
              </Row>
            ) : null}
          </>
        ) : action.kind === 'member' ? (
          quiet(copy.askOrganiser(action.organiser), 'day-trip-ask')
        ) : action.kind === 'drafting' ? (
          quiet(copy.draftingLine(guide.name), 'day-trip-drafting')
        ) : action.kind === 'noPlan' ? (
          quiet(copy.noPlanLine(), 'day-trip-no-plan')
        ) : (
          quiet(copy.closedLine(), 'day-trip-closed')
        )}
      </View>
    </Scaffold>
  );
}
