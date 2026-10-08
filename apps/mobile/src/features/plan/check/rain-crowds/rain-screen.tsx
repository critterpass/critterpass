/**
 * Rain and crowds (7h-4) for one day: the server's swaps for the day with its chart (the forecast
 * watch's open weather move stands for its blocks), each swap ticked to start; USE ALL applies the
 * ticked ones (an organiser) or suggests them (a member), "Send to the crew first" asks the crew,
 * and unticking every weather swap turns the forecast's suggestion down.
 */
import { tokens } from '@cp/design-tokens';

import { goBackOr } from '@/lib/navigation/back';
import { useCallback, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { useDayEditing } from '@/features/plan/day/use-day-editing';
import { useLocale } from '@/lib/i18n/use-locale';
import { useMotionMode } from '@/motion/motion-mode';
import { toast } from '@/motion/island-toast';

import { usePlanGuide } from '../../plan-guide';
import { sentToast } from '../check-copy';
import { checkRoutes } from '../routes';
import { dismissWeatherOnline } from '../commands';
import { useCheckContext } from '../data/use-check-context';
import { noteDayFixed } from '../fixed-days';
import { dayTag } from '../format';
import { planOpsOf } from '../plan-ops';
import type { ChartBlock } from './swap-chart';
import {
  forecastChip,
  reasonLine,
  recheckChip,
  rainTitle,
  sourceLine,
  spokenHour,
  allSwapsLabel,
} from './rain-copy';
import { RainView, type SwapRowView } from './rain-view';
import { useSwaps } from './use-swaps';

const COLOURS = [
  tokens.color.blue,
  tokens.color.yellow,
  tokens.color.green.base,
  tokens.color.pink,
  tokens.color.paper.base,
];
const BUSY_LEVEL = 70;

const minuteOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

export function RainScreen({ tripId, dayId }: { readonly tripId: string; readonly dayId: string }) {
  const plan = useTripPlan(tripId);
  const guideName = usePlanGuide().name;
  const editor = useDayEditing(plan);
  const ctx = useCheckContext(plan);
  const locale = useLocale();
  const { width } = useWindowDimensions();
  const [motionMode] = useMotionMode();
  const dismiss = useCommand(dismissWeatherOnline);
  const [busy, setBusy] = useState(false);
  const clock = useCallback((instant: string) => ctx.clock(instant, dayId), [ctx, dayId]);
  const swaps = useSwaps(tripId, dayId, plan.trip?.current_version_id ?? null, clock);
  const answer = swaps.answer;
  const date = ctx.dayDate(dayId);
  const colour = new Map(
    (answer?.now ?? []).map((block, index) => [
      block.stableId,
      COLOURS[index % COLOURS.length] ?? tokens.color.blue,
    ]),
  );
  const toBlock = (block: {
    stableId: string;
    startsAt: string;
    endsAt: string;
    problem: string | null;
  }): ChartBlock => ({
    key: block.stableId,
    start: minuteOf(clock(block.startsAt)),
    end: minuteOf(clock(block.endsAt)),
    color: colour.get(block.stableId) ?? tokens.color.blue,
    inTheWay: block.problem !== null,
  });
  const now = (answer?.now ?? []).map(toBlock);
  const swapped = now.map((block) => {
    const choice = swaps.choices.find((entry) => entry.stableId === block.key);
    if (choice === undefined || swaps.unticked.has(block.key)) return { ...block, inTheWay: false };
    const start = minuteOf(choice.to);
    return { ...block, start, end: start + (block.end - block.start), inTheWay: false };
  });
  const rows: SwapRowView[] = swaps.choices.map((choice) => ({
    key: choice.stableId,
    name: ctx.name(choice.stableId),
    color: colour.get(choice.stableId) ?? tokens.color.blue,
    from: choice.from,
    to: choice.to,
    why: reasonLine(choice.reason, {
      busyFrom: answer?.busyFrom ?? null,
      rainFrom: answer?.rain?.from ?? null,
      rainTo: answer?.rain?.to ?? null,
    }),
    ticked: !swaps.unticked.has(choice.stableId),
  }));
  const month = date === null ? '' : ctx.month(date);
  const rainAt = answer?.rain == null ? null : spokenHour(answer.rain.from, locale);
  const busyAt = answer?.busyFrom == null ? null : spokenHour(answer.busyFrom, locale);
  const chip =
    answer?.rain?.source === 'forecast'
      ? forecastChip()
      : answer?.rain?.recheckOn == null
        ? null
        : recheckChip(answer.rain.recheckOn, locale);

  const finish = (outcome: { kind: string }) => {
    setBusy(false);
    if (outcome.kind === 'unavailable') return;
    if (outcome.kind === 'applied') noteDayFixed(dayId);
    if (outcome.kind === 'proposed') toast.show({ id: 'plan-rain-sent', ...sentToast() });
    goBackOr(checkRoutes.check(tripId));
  };
  const ops = planOpsOf(swaps.ops);
  const use = () => {
    const weather = answer?.weather ?? null;
    if (swaps.turnDownWeather && weather !== null)
      void dismiss.send({ changeset_id: weather.changeSetId });
    if (ops.length === 0) {
      goBackOr(checkRoutes.check(tripId));
      return;
    }
    setBusy(true);
    void editor.submit(ops).then(finish);
  };

  return (
    <RainView
      backLabel={date === null ? '' : dayTag(date)}
      onBack={() => goBackOr(checkRoutes.check(tripId))}
      chip={chip}
      title={rainTitle(rainAt, busyAt)}
      source={sourceLine({
        month,
        rain: answer?.rain?.source ?? null,
        crowds: answer?.crowds?.source ?? null,
        guideName,
      })}
      state={answer === null ? 'loading' : rows.length === 0 ? 'none' : 'ready'}
      chart={
        answer === null
          ? null
          : {
              rain:
                answer.rain === null
                  ? null
                  : { from: minuteOf(answer.rain.from), to: minuteOf(answer.rain.to) },
              crowds: answer.crowds?.hourly ?? null,
              busyLevel: BUSY_LEVEL,
              now,
              swapped,
              width: width - 40,
              reducedMotion: motionMode !== 'full',
            }
      }
      rows={rows}
      onToggle={swaps.toggle}
      primary={{ label: allSwapsLabel(swaps.ops.length, plan.canApply), busy, onPress: use }}
      send={plan.canApply ? () => void editor.propose(ops, plan.state).then(finish) : null}
    />
  );
}
