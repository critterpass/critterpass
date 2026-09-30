/**
 * Trip plan overview (3e-1), from props only: "← TRIPS", who else is here, the share slot, the
 * "{DEST}, DAY BY DAY" title, LIST / MAP / CALENDAR, and the day list with its states: loading,
 * no plan yet, offline with the last sync time, a reorder that lost to someone else's change,
 * read-only, and an organiser's unproposed draft.
 */
import { t } from '@lingui/core/macro';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { Segmented } from '@/ui/inputs/Segmented';
import { AvatarStack, type StackMember } from '@/ui/people/AvatarStack';
import type { GuideId } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Skeleton } from '@/ui/states/Skeleton';
import { StaleCaption } from '@/ui/states/StaleCaption';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { DayList, type DropResult } from './day-list';
import type { DayCard } from './model/plan-model';

export type PlanTab = 'list' | 'map' | 'calendar';

export type PlanOverviewState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'no_plan';
      /** Organisers can start setup; members wait for their organiser. */
      readonly onSetup: (() => void) | null;
    }
  | { readonly kind: 'ready' };

export interface PlanOverviewViewProps {
  readonly state: PlanOverviewState;
  readonly destination: string | null;
  readonly guide: { readonly id: GuideId; readonly name: string };
  readonly here: readonly StackMember[];
  readonly share?: ReactNode;
  readonly tab: PlanTab;
  readonly onTab: (tab: PlanTab) => void;
  /** Map and calendar views; a tab without one is not offered. */
  readonly mapView?: ReactNode;
  readonly calendarView?: ReactNode;
  readonly cards: readonly DayCard[];
  readonly canReorder: boolean;
  readonly readOnly: boolean;
  readonly draft: { readonly onReview: () => void } | null;
  readonly offline: { readonly lastSyncedAt: Date | null } | null;
  readonly conflict: { readonly onDismiss: () => void } | null;
  readonly sweepDays: ReadonlySet<number>;
  readonly onSwept: () => void;
  readonly shakes: ReadonlyMap<number, number>;
  readonly onOpenDay: (card: DayCard) => void;
  readonly onReorder: (from: number, to: number) => DropResult;
  readonly onBack: () => void;
  /** Extra rows under the list (the personal plan's clash cards). */
  readonly footer?: ReactNode;
}

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['32'],
    gap: th.space['16'],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerEnd: { flexDirection: 'row', alignItems: 'center', gap: th.space['8'] },
  notice: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
    gap: th.space['6'],
  },
}));

function Notice({
  text,
  action,
  testID,
}: {
  readonly text: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
  readonly testID: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.notice} testID={testID}>
      <Text variant="bodySm">{text}</Text>
      {action ? <InlineAction label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

function Body(props: PlanOverviewViewProps & { readonly onDragging: (on: boolean) => void }) {
  const { state } = props;
  if (state.kind === 'loading') {
    return (
      <Skeleton
        preset="list"
        repeat={6}
        label={t({ id: 'plan.overview.loading', message: 'Loading the plan' })}
        testID="plan-loading"
      />
    );
  }
  if (state.kind === 'missing') {
    return (
      <Text variant="body" testID="plan-missing">
        {t({
          id: 'plan.overview.missing',
          message: 'This trip isn’t on your phone yet. It shows up once it syncs.',
        })}
      </Text>
    );
  }
  if (state.kind === 'no_plan') {
    return (
      <EmptyState
        guide={props.guide.id}
        guideName={props.guide.name}
        title={t({ id: 'plan.overview.empty.title', message: 'No plan yet' })}
        line={
          state.onSetup === null
            ? t({
                id: 'plan.overview.empty.member',
                message:
                  'Your organiser is still putting the days together. I’ll shout when it’s in.',
              })
            : t({
                id: 'plan.overview.empty.organiser',
                message: 'Tell me when, the budget and the must-dos, and I’ll draft the days.',
              })
        }
        {...(state.onSetup === null
          ? {}
          : {
              action: {
                label: t({ id: 'plan.overview.empty.setup', message: 'Set up the trip' }),
                onPress: state.onSetup,
              },
            })}
        testID="plan-empty"
      />
    );
  }
  if (props.tab === 'map' && props.mapView) return <>{props.mapView}</>;
  if (props.tab === 'calendar' && props.calendarView) return <>{props.calendarView}</>;
  return (
    <DayList
      cards={props.cards}
      canReorder={props.canReorder}
      sweepDays={props.sweepDays}
      onSwept={props.onSwept}
      shakes={props.shakes}
      onOpen={props.onOpenDay}
      onReorder={props.onReorder}
      onDragging={props.onDragging}
    />
  );
}

export function PlanOverviewView(props: PlanOverviewViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const title =
    props.destination === null
      ? t({ id: 'plan.overview.titleNoPlace', message: 'Day by day' })
      : t({ id: 'plan.overview.title', message: `${props.destination}, day by day` });
  const segments = [
    { value: 'list' as const, label: t({ id: 'plan.overview.tab.list', message: 'List' }) },
    ...(props.mapView
      ? [{ value: 'map' as const, label: t({ id: 'plan.overview.tab.map', message: 'Map' }) }]
      : []),
    ...(props.calendarView
      ? [
          {
            value: 'calendar' as const,
            label: t({ id: 'plan.overview.tab.calendar', message: 'Calendar' }),
          },
        ]
      : []),
  ];
  const ready = props.state.kind === 'ready';
  const [dragging, setDragging] = useState(false);
  return (
    <Scaffold variant="dark" edges={['top']} testID="plan-overview">
      <ScrollView
        contentContainerStyle={styles.content}
        scrollEnabled={props.tab !== 'map' && !dragging}
      >
        <View style={styles.header}>
          <BackEyebrow
            label={t({ id: 'plan.overview.back', message: 'Trips' })}
            onPress={props.onBack}
          />
          <View style={styles.headerEnd}>
            {props.offline ? <OfflinePill testID="plan-offline" /> : null}
            {props.here.length > 0 ? (
              <AvatarStack members={props.here} size="sm" testID="plan-here" />
            ) : null}
            {props.share}
          </View>
        </View>
        <Text variant="h1" accessibilityRole="header">
          {upper(title, locale)}
        </Text>
        {props.offline?.lastSyncedAt ? (
          <StaleCaption updatedAt={props.offline.lastSyncedAt} testID="plan-last-synced" />
        ) : null}
        {ready && segments.length > 1 ? (
          <Segmented
            label={t({ id: 'plan.overview.views', message: 'Plan view' })}
            segments={segments}
            value={props.tab}
            onChange={props.onTab}
            testID="plan-tabs"
          />
        ) : null}
        {ready && props.draft ? (
          <Notice
            text={t({
              id: 'plan.overview.draft',
              message: 'Your draft. Only you can see it until you send it to the crew.',
            })}
            action={{
              label: t({ id: 'plan.overview.draftReview', message: 'Review the draft' }),
              onPress: props.draft.onReview,
            }}
            testID="plan-draft"
          />
        ) : null}
        {ready && props.readOnly ? (
          <Notice
            text={t({
              id: 'plan.overview.readOnly',
              message: 'You can look through the plan, but not change it.',
            })}
            testID="plan-read-only"
          />
        ) : null}
        {ready && props.conflict ? (
          <Notice
            text={t({
              id: 'plan.overview.conflict',
              message: 'Someone changed the plan while you were moving days. This is the latest.',
            })}
            action={{
              label: t({ id: 'plan.overview.conflictOk', message: 'Got it' }),
              onPress: props.conflict.onDismiss,
            }}
            testID="plan-conflict"
          />
        ) : null}
        <Body {...props} onDragging={setDragging} />
        {ready ? props.footer : null}
        <View style={{ height: theme.space['24'] }} />
      </ScrollView>
    </Scaffold>
  );
}
