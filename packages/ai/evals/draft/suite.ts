/**
 * The `draft` eval suite (`pnpm --filter @cp/ai eval draft`): the golden crews (the six guide
 * cities, and real place sets of Đà Lạt, Đà Nẵng and Bali), the redraft requests and the injection
 * cases (planted instructions in must-do wishes, redraft notes and crew chat) run through the real
 * drafting pipeline and graded by ./asserts/draft-asserts.ts and ./asserts/day-shape-asserts.ts. The pass rate must meet the threshold (every case, after repair),
 * and the share of drafts the validator passes on the first try must reach `first_pass_min`.
 *
 * Replay serves each case's recorded DeepSeek responses (`fixtures/<case>.json`, one per call key)
 * through the real gateway; live runs call DeepSeek and, with EVAL_RECORD=1, store them.
 * EVAL_CASES (comma-separated case ids) narrows a run to those cases, e.g. to record one.
 */
import type { DraftPlanInput } from '../../src/prompts/draft/context';
import { runDraftPlan } from '../../src/prompts/draft/pipeline';
import { runRedraft } from '../../src/prompts/draft/redraft';
import { longVisitsOf, templateSummary, writeDraftSummary } from '../../src/prompts/draft/summary';
import type { CaseReport, SuiteReport } from '../lib/runner';
import {
  gradeDayFinish,
  gradeFullDays,
  gradeHeld,
  gradeHoles,
  gradeMustSees,
  gradeRain,
  gradeMustDos,
  gradeRedraftReasons,
} from './asserts/day-shape-asserts';
import { gradeDayRules } from './asserts/day-rules-asserts';
import { gradeDraftLanguage, gradeEssentials, gradeLanguage } from './asserts/language-asserts';
import { gradeDraft, gradeRedraft, gradeWishes } from './asserts/draft-asserts';
import { gradePlaces, gradePlanRules, gradeRedraftRules } from './asserts/plan-rules-asserts';
import { baselineItinerary } from './baseline';
import { caseModel, type RecordingOptions } from './recorded-model';
import { withBaseDay } from './base-day';
import { pooled } from './pool';
import {
  CREWS,
  INJECTION_DRAFTS,
  planInput,
  REDRAFTS,
  mustDoId,
  wishId,
  type CrewCase,
  type RedraftCase,
} from './cases';

export const DRAFT_SUITE = 'draft';
export const FIRST_PASS_MIN = 0.9;

export interface DraftSuiteOptions extends RecordingOptions {
  /** Cases run at once in live mode. */
  readonly concurrency?: number;
}

function report(description: string, failures: readonly string[], output: string): CaseReport {
  return {
    description,
    outcome: failures.length === 0 ? 'pass' : 'fail',
    assertions:
      failures.length === 0
        ? [{ type: 'draft', outcome: 'pass', reason: 'all checks' }]
        : failures.map((reason) => ({ type: 'draft', outcome: 'fail' as const, reason })),
    output,
  };
}

interface DraftCaseResult {
  readonly report: CaseReport;
  readonly firstPassClean: boolean | null;
}

async function draftCase(crew: CrewCase, options: DraftSuiteOptions): Promise<DraftCaseResult> {
  const input = planInput(crew);
  const { model, save } = caseModel(crew.id, options);
  try {
    const asked = input;
    const result = await runDraftPlan(model, asked);
    const themes = result.itinerary.days.map((d) => d.theme);
    const allMustDos = result.final.violations.every((v) => v.code !== 'MUST_DO_MISSING');
    const text = await writeDraftSummary(model, {
      guide: input.guide,
      destination: input.destination.split(',')[0] ?? input.destination,
      themes,
      allMustDos,
      names: [...input.pois.values()].map((poi) => poi.name),
      ...(crew.locale === undefined ? {} : { locale: crew.locale }),
      longVisits: longVisitsOf(result.input, result.itinerary),
    });
    const fromModel =
      text !==
      templateSummary({
        guide: input.guide,
        destination: input.destination.split(',')[0] ?? '',
        themes,
        allMustDos,
        ...(crew.locale === undefined ? {} : { locale: crew.locale }),
      });
    save();
    const output = result.itinerary.days
      .map(
        (d) =>
          `${d.day_no}. ${d.theme}: ${d.items.map((i) => input.pois.get(i.poi_id ?? '')?.name ?? i.poi_id).join(' → ')}`,
      )
      .join(' / ');
    return {
      report: report(
        `${crew.id} (${crew.days} days)`,
        [
          // Graded on the input the days were planned on (the guide's wish answers applied).
          ...gradeDraft(result.input, result, { text, fromModel }),
          ...gradeWishes(result.input, result, crew.expect_wishes, (i) => wishId(crew, i)),
          ...gradeMustDos(result.input, result.itinerary, crew.expect_must_dos, (i) =>
            mustDoId(crew, i),
          ),
          ...(crew.expect_full_days ? gradeFullDays(result.input, result) : []),
          ...gradeDayFinish(result.input, result.itinerary),
          ...gradeHeld(result.input, result.itinerary),
          ...gradeEssentials(result.input, result),
          ...(crew.expect_day_rules ? gradeDayRules(result.input, result.itinerary) : []),
          ...gradeDraftLanguage(crew.locale, result.itinerary, text),
          ...gradeMustSees(result.input, result.itinerary, crew.expect_core_min),
          ...(crew.expect_full_days ? gradeHoles(result.input, result.itinerary) : []),
          ...(crew.expect_plan_rules ? gradePlanRules(result.input, result, text) : []),
          ...gradePlaces(result, crew.expect_places),
        ],
        `${output} || ${text}`,
      ),
      firstPassClean: result.first.ok,
    };
  } catch (error) {
    save();
    return {
      report: report(`${crew.id}`, [`failed: ${String(error)}`], ''),
      firstPassClean: false,
    };
  }
}

async function redraftCase(
  redraft: RedraftCase,
  options: DraftSuiteOptions,
): Promise<DraftCaseResult> {
  const crew = CREWS.find((c) => c.id === redraft.crew);
  if (crew === undefined) throw new Error(`no crew ${redraft.crew}`);
  const input: DraftPlanInput = planInput(crew);
  const base =
    redraft.base_day === undefined
      ? baselineItinerary(input)
      : withBaseDay(input, baselineItinerary(input), redraft.day, redraft.base_day);
  const { model, save } = caseModel(redraft.id, options);
  try {
    const outcome = await runRedraft(model, {
      ...input,
      base,
      dayNo: redraft.day,
      reasons: redraft.reasons,
      note: redraft.note,
      ...(redraft.locale === undefined ? {} : { locale: redraft.locale }),
      chat: redraft.chat.map((line, i) => ({
        id: `chat-${i}`,
        author: line.author,
        text: line.text,
        at: '2026-10-01T10:00:00Z',
      })),
    });
    save();
    const output = `${outcome.title ?? '?'}: ${outcome.day.items.map((i) => input.pois.get(i.poi_id ?? '')?.name ?? i.poi_id).join(' → ')} | ${outcome.summary ?? ''}`;
    return {
      report: report(
        redraft.id,
        [
          ...gradeRedraft(input, base, redraft.day, outcome),
          ...gradeRedraftReasons(input, base, redraft.day, redraft.reasons, outcome),
          ...gradeHeld(input, outcome.itinerary),
          ...gradeLanguage(redraft.locale, outcome),
          ...gradeRain(input, redraft.note, outcome),
          ...gradeRedraftRules(input, base, redraft.day, redraft, outcome),
        ],
        output,
      ),
      firstPassClean: null,
    };
  } catch (error) {
    save();
    return { report: report(redraft.id, [`failed: ${String(error)}`], ''), firstPassClean: null };
  }
}

export async function runDraftSuite(
  options: DraftSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const size = options.mode === 'live' ? (options.concurrency ?? 4) : 1;
  // EVAL_CASES=danang-1,redraft-3 runs (and with EVAL_RECORD=1 records) only those cases.
  const only = process.env['EVAL_CASES']?.split(',').filter(Boolean) ?? [];
  const picked = <T extends { readonly id: string }>(cases: readonly T[]) =>
    only.length === 0 ? cases : cases.filter((c) => only.includes(c.id));
  const drafts = await pooled(picked([...CREWS, ...INJECTION_DRAFTS]), size, (crew) =>
    draftCase(crew, options),
  );
  const redrafts = await pooled(picked(REDRAFTS), size, (r) => redraftCase(r, options));
  const firsts = drafts.map((d) => d.firstPassClean).filter((v): v is boolean => v !== null);
  const firstRate = firsts.length === 0 ? 0 : firsts.filter(Boolean).length / firsts.length;
  const cases = [...drafts, ...redrafts].map((c) => c.report);
  const passed = cases.filter((c) => c.outcome === 'pass').length;
  const score = cases.length === 0 ? 0 : passed / cases.length;
  const firstCase = report(
    `validator-clean on the first pass: ${(firstRate * 100).toFixed(0)}% of ${firsts.length} drafts (min ${FIRST_PASS_MIN * 100}%)`,
    firstRate >= FIRST_PASS_MIN ? [] : ['below the first-pass minimum'],
    '',
  );
  return {
    suite: DRAFT_SUITE,
    mode: options.mode,
    graded: cases.length,
    passed,
    score,
    threshold,
    ok: cases.length > 0 && score >= threshold && firstRate >= FIRST_PASS_MIN,
    cases: [firstCase, ...cases],
  };
}
