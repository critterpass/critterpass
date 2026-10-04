/**
 * The rows of the places list (7c-3): a group's title, a place that swipes (+ to add, SPLIT when
 * the crew can't agree), the one collapsed IN THE PLAN row with its day dots, and the labelled
 * sponsored row.
 */
import { resolveMemberStyle } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import type { FitLine } from '@/data/fit/fit-line';
import type { StackMember } from '@/ui/people/AvatarStack';
import { AddButton, PlaceRow, PlanningTag } from '@/ui/planning';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { categoryIcon } from '../category';
import { SponsoredTag, WhySponsoredLink } from '../components/sponsored-card';
import { addLabel, planSummary, splitLabel } from './places-copy';
import type { HubPlace } from './places-model';
import type { SwipeAction } from './swipe-actions';
import { SwipeRow } from './swipe-row';

const useStyles = makeStyles((t) => ({
  title: {
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['16'],
    paddingBottom: t.space['8'],
  },
  card: { marginHorizontal: t.size.gutter, borderRadius: t.radius.lg, overflow: 'hidden' },
  gap: { height: t.space['2'] },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    marginHorizontal: t.size.gutter,
    padding: t.space['14'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
  },
  dots: { flexDirection: 'row' },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginEnd: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: { flex: 1, minWidth: 0 },
  sponsored: { marginHorizontal: t.size.gutter, gap: t.space['4'] },
}));

export function GroupTitle({
  title,
  testID,
}: {
  readonly title: string;
  readonly testID?: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n } = useLingui();
  return (
    <View style={styles.title}>
      <Text variant="eyebrow" color={theme.semantic.text.secondary} testID={testID}>
        {upper(title, i18n.locale)}
      </Text>
    </View>
  );
}

export interface PlaceListRowProps {
  readonly place: HubPlace;
  readonly meta: string;
  readonly savers: readonly StackMember[];
  readonly fit: FitLine | undefined;
  readonly onOpen: () => void;
  readonly onAdd?: (() => void) | undefined;
  readonly onSplit?: (() => void) | undefined;
  readonly onAction?: ((action: SwipeAction) => void) | undefined;
  readonly sponsored?: { readonly onWhy: () => void } | undefined;
  readonly testID: string;
}

export function PlaceListRow(props: PlaceListRowProps) {
  const styles = useStyles();
  const { i18n } = useLingui();
  const split = props.fit?.tone === 'split' && props.onSplit !== undefined;
  const trailing = split ? (
    <PressScale
      widthClass="narrow"
      accessibilityRole="button"
      accessibilityLabel={splitLabel()}
      onPress={props.onSplit}
      testID={`${props.testID}-split`}
    >
      <PlanningTag label={upper(splitLabel(), i18n.locale)} />
    </PressScale>
  ) : props.onAdd === undefined ? null : (
    <AddButton
      accessibilityLabel={addLabel(props.place.name)}
      onPress={props.onAdd}
      testID={`${props.testID}-add`}
    />
  );
  const row = (
    <PlaceRow
      title={upper(props.place.name, i18n.locale)}
      meta={props.meta}
      icon={categoryIcon(props.place.category)}
      savers={props.savers}
      fitLine={props.fit}
      trailing={
        props.sponsored === undefined ? (
          trailing
        ) : (
          <View>
            <SponsoredTag />
            {trailing}
          </View>
        )
      }
      onPress={props.onOpen}
      testID={props.testID}
    />
  );
  const body =
    props.onAction === undefined ? (
      row
    ) : (
      <SwipeRow
        canSave={props.place.standing === 'suggested'}
        onAction={props.onAction}
        testID={`${props.testID}-swipe`}
      >
        {row}
      </SwipeRow>
    );
  return (
    <View style={props.sponsored === undefined ? styles.card : styles.sponsored}>
      {props.sponsored === undefined ? (
        body
      ) : (
        <>
          <View style={styles.card}>{body}</View>
          <WhySponsoredLink onPress={props.sponsored.onWhy} />
        </>
      )}
    </View>
  );
}

export function RowGap() {
  const styles = useStyles();
  return <View style={styles.gap} />;
}

export interface PlanSummaryRowProps {
  readonly places: readonly HubPlace[];
  readonly onPress?: (() => void) | undefined;
}

export function PlanSummaryRow({ places, onPress }: PlanSummaryRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const days = [...new Set(places.flatMap((place) => (place.dayNo === null ? [] : [place.dayNo])))]
    .sort((a, b) => a - b)
    .slice(0, 3);
  const summary = planSummary(places.map((place) => place.name));
  return (
    <PressScale
      style={styles.plan}
      accessibilityRole="button"
      accessibilityLabel={summary}
      onPress={onPress}
      disabled={onPress === undefined}
      testID="places-plan-row"
    >
      <View style={styles.dots}>
        {days.map((day) => (
          <View
            key={day}
            style={[styles.dot, { backgroundColor: resolveMemberStyle(day - 1).color }]}
          >
            <Text variant="label" color={theme.semantic.text.onAccent}>
              {String(day)}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.summary}>
        <Text variant="body" numberOfLines={2}>
          {summary}
        </Text>
      </View>
      <Text variant="title" color={theme.semantic.text.secondary}>
        {'›'}
      </Text>
    </PressScale>
  );
}
