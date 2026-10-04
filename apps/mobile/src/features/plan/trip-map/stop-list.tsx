/**
 * A day's stops as the timeline both the trip map's day sheet (7a-2) and the day plan (7b-1) show:
 * time over length, the numbered stop (outlined when the check found something), VOTE or SWAP?
 * at its end, the leg to the next stop and the free time after it. The day plan adds the guide's
 * note under the stop an issue names.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { GapSlot, LegConnector, TimedStop, TokekNote } from '@/ui/planning';
import type { GuideId } from '@/ui/people/GuideLine';
import { makeStyles } from '@/ui/theme';
import type { PlanMember } from '@/data/plan/use-trip-plan';

import { decideRoute } from '../day/routes';
import { clock } from '../day/format';
import type { FreeGap } from './day-gaps';
import { issueLine } from './format';
import type { StopRow } from './stop-rows';
import { whoFree } from './stop-rows';
import { useFillGap, useFixer } from './use-ways-out';
import { GuideSticker } from './guide-sticker';

const useStyles = makeStyles((t) => ({
  list: { gap: t.space['4'] },
  note: { paddingStart: t.space['12'] },
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
        label={t({ id: 'plan.tripMap.swap', message: 'Swap?' })}
        onPress={fixer}
        testID={`stop-${String(row.n)}-swap`}
      />
    ) : null;
  return (
    <View>
      <TimedStop
        time={row.time}
        {...(row.length === undefined ? {} : { length: row.length })}
        n={row.n}
        title={row.stop.title}
        detail={row.detail}
        color={context.color}
        outlined={row.issue !== null || context.picked === row.stop.stableId}
        trailing={trailing ?? action}
        onPress={() => context.onOpenStop(row)}
        testID={`stop-${String(row.n)}`}
      />
      {context.notes && row.issue !== null ? (
        <View style={styles.note}>
          <TokekNote
            guide={context.guide.id}
            sticker={<GuideSticker guide={context.guide.id} />}
            name={context.guide.name}
            line={issueLine(row.issue, context.titleOf)}
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

export function StopList({
  rows,
  context,
}: {
  readonly rows: readonly StopRow[];
  readonly context: StopListContext;
}) {
  const styles = useStyles();
  return (
    <View style={styles.list} testID="stop-list">
      {rows.map((row) => (
        <StopBlock key={row.stop.stableId} row={row} context={context} />
      ))}
    </View>
  );
}
