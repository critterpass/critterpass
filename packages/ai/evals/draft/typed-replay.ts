/**
 * The typed places replay: every golden crew drafted twice, once from the editors' text
 * (`planner.typed_places` off, replies recorded for key-off input in fixtures/) and once from typed
 * facts (on, labels from golden/typed-places.json, replies recorded for key-on input in
 * fixtures-typed/ by ./typed-record.ts), and the drafts compared per city on what a traveller
 * notices: meals inside the meal stretches, days with a lunch and a dinner, evening places after
 * sunset, whole-day places alone on their day, must-sees placed, and no place twice. A stop is
 * judged by its place as the editors wrote it, whichever way the draft read it.
 *
 *   pnpm --filter @cp/ai exec tsx evals/draft/typed-replay.ts [--off-dir <dir>] [--on-dir <dir>]
 */
import type { Itinerary } from '@cp/domain';
import {
  collapseSamePlaces,
  foodRole,
  mealAt,
  minuteOfDate,
  partOfVisit,
  placeTimes,
  sunsetMin,
  visitSpan,
  type DraftPoi,
} from '@cp/planner';

import { runDraftPlan } from '../../src/prompts/draft/pipeline';
import { CREWS, planInput, type CrewCase } from './cases';
import { caseModel, FIXTURES, TYPED_FIXTURES } from './recorded-model';

/** Where each side's recordings are read: `--off-dir` and `--on-dir` override them. */
function dirOf(flag: string, fallback: string): string {
  const at = process.argv.indexOf(flag);
  return (at === -1 ? undefined : process.argv[at + 1]) ?? fallback;
}

/** Passing and graded counts of each measure (must-sees: places held, of those the city has). */
interface Tally {
  cases: number;
  failed: number;
  clean: number;
  meals: [number, number];
  fed: [number, number];
  evenings: [number, number];
  wholeDays: [number, number];
  mustSees: [number, number];
  twice: number;
}

const empty = (): Tally => ({
  cases: 0,
  failed: 0,
  clean: 0,
  meals: [0, 0],
  fed: [0, 0],
  evenings: [0, 0],
  wholeDays: [0, 0],
  mustSees: [0, 0],
  twice: 0,
});

const add = (pair: [number, number], ok: boolean) => {
  pair[0] += ok ? 1 : 0;
  pair[1] += 1;
};

/** Grades `plan` by the editors' places (`judge`), whatever the draft was planned from. */
function grade(tally: Tally, plan: Itinerary, judge: ReadonlyMap<string, DraftPoi>): void {
  const seen: DraftPoi[] = [];
  for (const day of plan.days) {
    const stops = day.items.flatMap((item) => {
      const poi = judge.get(item.poi_id ?? '');
      return poi === undefined ? [] : [{ item, poi }];
    });
    const slots = stops
      .filter(({ item }) => item.kind === 'meal')
      .map(({ item }) => mealAt(minuteOfDate(new Date(item.starts_at), day.date, item.tz)));
    add(tally.fed, slots.includes('lunch') && slots.includes('dinner'));
    for (const { item, poi } of stops) {
      seen.push(poi);
      const start = minuteOfDate(new Date(item.starts_at), day.date, item.tz);
      if (item.kind === 'meal') add(tally.meals, mealAt(start) !== null);
      const times = placeTimes(poi);
      const late = times.find((t) => t !== 'morning');
      if (late !== undefined && !times.includes('morning')) {
        const sunset = sunsetMin(poi, day.date);
        add(tally.evenings, start >= sunset - (late === 'sunset' ? 120 : 30));
      }
      if (item.kind === 'activity' && visitSpan(poi) === 'full') {
        const rivals = stops.filter(
          (other) =>
            other.poi.id !== poi.id &&
            other.item.kind === 'activity' &&
            foodRole(other.poi) === null &&
            !partOfVisit(other.poi, poi),
        );
        add(tally.wholeDays, rivals.length === 0);
      }
    }
  }
  const ids = seen.map((poi) => poi.id);
  const distinct = [...new Map(seen.map((poi) => [poi.id, poi])).values()];
  const merged = collapseSamePlaces(distinct).kept.length;
  tally.twice += ids.length - new Set(ids).size + (distinct.length - merged);
  const core = [...judge.values()].filter((poi) => poi.mustSee || poi.essential === true);
  const held = new Set(ids);
  tally.mustSees[0] += core.filter((poi) => held.has(poi.id)).length;
  tally.mustSees[1] += core.length;
}

async function draft(crew: CrewCase, typed: boolean, tally: Tally): Promise<void> {
  tally.cases += 1;
  const judge = planInput(crew).pois;
  try {
    const dir = typed ? dirOf('--on-dir', TYPED_FIXTURES) : dirOf('--off-dir', FIXTURES);
    const { model } = caseModel(crew.id, { mode: 'replay' }, dir);
    const result = await runDraftPlan(model, planInput(crew, undefined, typed));
    tally.clean += result.final.ok ? 1 : 0;
    grade(tally, result.itinerary, judge);
  } catch (error) {
    tally.failed += 1;
    console.error(`${crew.id} (${typed ? 'on' : 'off'}): ${String(error).slice(0, 160)}`);
  }
}

const pct = ([ok, all]: [number, number]) =>
  all === 0 ? 'n/a' : `${Math.round((100 * ok) / all)}% (${ok}/${all})`;

async function main(): Promise<void> {
  const only = process.env['EVAL_CASES']?.split(',').filter(Boolean) ?? [];
  const crews = only.length === 0 ? CREWS : CREWS.filter((c) => only.includes(c.id));
  const rows = new Map<string, { off: Tally; on: Tally }>();
  for (const crew of crews) {
    const row = rows.get(crew.city) ?? { off: empty(), on: empty() };
    rows.set(crew.city, row);
    await draft(crew, false, row.off);
    await draft(crew, true, row.on);
  }
  console.log(
    '| city | cases | failed off/on | validator-clean off/on | meals in stretch off → on | days with lunch and dinner off → on | evening after sunset off → on | whole day alone off → on | must-sees held off → on | place twice off/on |',
  );
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const [city, { off, on }] of rows) {
    console.log(
      `| ${city} | ${off.cases} | ${off.failed}/${on.failed} | ${off.clean}/${on.clean} | ${pct(off.meals)} → ${pct(on.meals)} | ${pct(off.fed)} → ${pct(on.fed)} | ${pct(off.evenings)} → ${pct(on.evenings)} | ${pct(off.wholeDays)} → ${pct(on.wholeDays)} | ${pct(off.mustSees)} → ${pct(on.mustSees)} | ${off.twice}/${on.twice} |`,
    );
  }
}

await main();
