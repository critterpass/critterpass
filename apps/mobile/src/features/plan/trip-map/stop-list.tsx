/**
 * A day's stops as the timeline both the trip map's day sheet (7a-2) and the day plan (7b-1) show:
 * time over length, the numbered stop (outlined when the check found something), VOTE or the fix
 * the check offers at its end (else GO where the list offers it), the leg to the next stop and the
 * free time after it. The day plan adds the guide's note under the stop an issue names, once. A
 * stop I skip stands back; today, the stops already over are ticked and a NOW line sits above the
 * first one still to come. The list opens with when to leave the stay and closes with when the day
 * is back at it, then the stops only I have.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { goHref } from '@/features/go';
import { GoButton } from '@/ui/buttons/GoButton';
import { PillButton } from '@/ui/buttons/PillButton';
import { GapSlot, LegConnector, PlanningTag, TimedStop, TokekNote } from '@/ui/planning';
import { Text } from '@/ui/text/Text';
import type { GuideId } from '@/ui/people/GuideLine';
import { makeStyles, useTheme } from '@/ui/theme';
import type { PlanMember } from '@/data/plan/use-trip-plan';

import { decideRoute } from '../day/routes';
import { clock } from '../day/format';
import type { FreeGap } from './day-gaps';
import { fixLabel, issueLine } from './format';
import type { StayRows, StopRow } from './stop-rows';
import { onlyYouDetail, whoFree } from './stop-rows';
import type { DayItem } from '@/data/plan/plan-model';
import { useFillGap, useFixer } from './use-ways-out';
import { GuideSticker } from './guide-sticker';

/** Stands in for the number on a stop the day's route does not count. */
const MINE_MARK = '•';

const useStyles = makeStyles((t) => ({
  list: { gap: t.space['4'] },
  note: { paddingStart: t.space['12'] },
  now: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['8'],
    paddingVertical: t.space['4'],
  },
  nowRule: { flex: 1, height: 2, borderRadius: 1, backgroundColor: t.semantic.action.primary },
  edge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    paddingVertical: t.space['6'],
  },
  edgeTime: { width: 50, alignItems: 'flex-end' },
  edgeText: { flex: 1, minWidth: 0 },
  mine: { gap: t.space['4'], paddingTop: t.space['8'] },
}));

export interface StopListContext {
  readonly tripId: string;
  readonly dayNo: number;
  readonly dayId: string | null;
  readonly color: string;
  readonly members: readonly PlanMember[];
  readonly me: string | null;
  readonly guide: { readonly id: GuideId; readonly name: string };
  /** The guide's note under a stop with an issue (the day plan); the sheet tags it instead. */
  readonly notes: boolean;
  readonly onOpenStop: (row: StopRow) => void;
  /** A stop's name by stable id (an issue can name two). */
  readonly titleOf: (stableId: string) => string;
  /** The picked stop is outlined too (its marker is open on the map). */
  readonly picked?: string | null | undefined;
  /** The stops that offer GO where VOTE or the fix isn't (today's next stop), by stable id. */
  readonly go?: readonly string[] | undefined;
  /** The stops can be held and dragged (the day plan): a grip at the end of each says so. */
  readonly handle?: boolean | undefined;
}

/** GO on a stop the list offers it on: its place and the trip. */
function goFor(row: StopRow, context: StopListContext): (() => void) | null {
  const { go } = context;
  const poiId = row.stop.poiId;
  if (go === undefined || poiId === null || !go.includes(row.stop.stableId)) return null;
  return () => router.push(goHref({ kind: 'place', poiId, tripId: context.tripId }));
}

function Gap({ gap, context }: { readonly gap: FreeGap; readonly context: StopListContext }) {
  const { t } = useLingui();
  const locale = useLocale();
  const fill = useFillGap(context.tripId, context.dayNo, context.dayId, gap);
  const count = gap.whoFree.length;
  const who = whoFree(locale, gap, context.members, context.me);
  const until = clock(locale, gap.to);
  const everyone = count >= context.members.length;
  const text = everyone
    ? t({ id: 'plan.tripMap.gap.everyone', message: `Everyone is free · till ${until}` })
    : t({
        id: 'plan.tripMap.gap.some',
        message: `${count} of you are free · ${who}, till ${until}`,
      });
  return (
    <GapSlot
      time={clock(locale, gap.from)}
      text={text}
      {...(fill === null
        ? {}
        : { onAdd: fill, addLabel: t({ id: 'plan.tripMap.gap.fill', message: 'Fill it' }) })}
      testID={`stop-gap-${String(gap.from)}`}
    />
  );
}

export function StopBlock({
  row,
  context,
  trailing,
}: {
  readonly row: StopRow;
  readonly context: StopListContext;
  /** Replaces the row's own VOTE / SWAP? (the day plan's drag handle row). */
  readonly trailing?: ReactNode;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const fixer = useFixer(context.tripId, row.issue, context.dayNo);
  const action =
    row.vote !== null ? (
      <PillButton
        size="sm"
        variant="secondary"
        label={t({ id: 'plan.tripMap.vote', message: 'Vote' })}
        onPress={() => router.push(decideRoute(context.tripId, row.vote?.pollId ?? ''))}
        testID={`stop-${String(row.n)}-vote`}
      />
    ) : row.issue !== null && fixer !== null && !context.notes ? (
      <PillButton
        size="sm"
        label={fixLabel(row.issue)}
        onPress={fixer}
        testID={`stop-${String(row.n)}-swap`}
      />
    ) : null;
  const go = action === null ? goFor(row, context) : null;
  const theme = useTheme();
  return (
    <View>
      {row.nowLine === null ? null : (
        <View style={styles.now} testID="stop-now-line">
          <PlanningTag
            label={t({ id: 'plan.tripMap.now', message: `Now · ${row.nowLine}` })}
            color={theme.semantic.action.primary}
          />
          <View style={styles.nowRule} />
        </View>
      )}
      <TimedStop
        time={row.time}
        {...(row.length === undefined ? {} : { length: row.length })}
        n={row.n}
        title={row.stop.title}
        detail={row.detail}
        color={context.color}
        outlined={row.issue !== null || context.picked === row.stop.stableId}
        titleLines={2}
        dimmed={row.personal === 'skipping'}
        done={row.moment === 'done'}
        trailing={
          trailing ??
          action ??
          (go !== null ? (
            <GoButton onPress={go} testID={`stop-${String(row.n)}-go`} />
          ) : context.handle === true ? (
            <Text variant="label" color={theme.semantic.text.secondary}>
              ≡
            </Text>
          ) : null)
        }
        onPress={() => context.onOpenStop(row)}
        testID={`stop-${String(row.n)}`}
      />
      {context.notes && row.note !== null ? (
        <View style={styles.note}>
          <TokekNote
            guide={context.guide.id}
            sticker={<GuideSticker guide={context.guide.id} />}
            name={context.guide.name}
            line={issueLine(row.note, context.titleOf)}
            {...(fixer === null
              ? {}
              : {
                  action: { label: t({ id: 'plan.tripMap.see', message: 'See' }), onPress: fixer },
                })}
            testID={`stop-${String(row.n)}-note`}
          />
        </View>
      ) : null}
      {row.legAfter === null ? null : <LegConnector label={row.legAfter} />}
      {row.gapsAfter.map((gap) => (
        <Gap key={gap.from} gap={gap} context={context} />
      ))}
    </View>
  );
}

/** "07:50 · Leave the stay · Car · 1h10" above the day, "Back at the stay · about 21:40" under it. */
export function StayEdge({
  kind,
  edge,
}: {
  readonly kind: 'leave' | 'back';
  readonly edge: NonNullable<StayRows['leave']>;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const leg = edge.leg;
  return (
    <View style={styles.edge} testID={`stop-list-${kind}`}>
      <View style={styles.edgeTime}>
        <Text
          variant="monoData"
          color={theme.semantic.text.secondary}
          numberOfLines={1}
          autoFit
          autoFitMinSize={10}
        >
          {edge.time}
        </Text>
      </View>
      <Text variant="label" color={theme.semantic.text.secondary} style={styles.edgeText}>
        {kind === 'leave'
          ? t({ id: 'plan.tripMap.leaveStay', message: `Leave the stay · ${leg}` })
          : t({ id: 'plan.tripMap.backAtStay', message: `Back at the stay · ${leg}` })}
      </Text>
    </View>
  );
}

/** The stops only I have on the day ("just me"), under the crew's: tagged, never numbered. */
export function MineList({
  rows,
  onOpen,
}: {
  readonly rows: readonly { readonly time: string; readonly stop: DayItem }[];
  readonly onOpen?: ((stop: DayItem) => void) | undefined;
}) {
  const styles = useStyles();
  const theme = useTheme();
  if (rows.length === 0) return null;
  return (
    <View style={styles.mine} testID="stop-list-mine">
      {rows.map(({ time, stop }) => (
        <TimedStop
          key={stop.stableId}
          time={time}
          n={0}
          mark={MINE_MARK}
          title={stop.title}
          detail={onlyYouDetail()}
          color={theme.semantic.bg.control}
          titleLines={2}
          {...(onOpen === undefined ? {} : { onPress: () => onOpen(stop) })}
          testID={`stop-mine-${stop.stableId}`}
        />
      ))}
    </View>
  );
}

export function StopList({
  rows,
  context,
  stay,
  mine,
}: {
  readonly rows: readonly StopRow[];
  readonly context: StopListContext;
  readonly stay?: StayRows | undefined;
  readonly mine?: readonly { readonly time: string; readonly stop: DayItem }[] | undefined;
}) {
  const styles = useStyles();
  return (
    <View style={styles.list} testID="stop-list">
      {stay?.leave == null ? null : <StayEdge kind="leave" edge={stay.leave} />}
      {rows.map((row) => (
        <StopBlock key={row.stop.stableId} row={row} context={context} />
      ))}
      {stay?.back == null ? null : <StayEdge kind="back" edge={stay.back} />}
      <MineList rows={mine ?? []} />
    </View>
  );
}
