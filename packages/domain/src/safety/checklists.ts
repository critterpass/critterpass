/**
 * Help checklists (3k-6 problem tiles): a curated step list per problem, filled from the curated
 * catalogue (numbers, facilities, phrase cards) for where the traveller is. The guide may reword a
 * step in the traveller's language (`help.checklist`), never add one, drop a fact or invent a
 * number, place or medical instruction; without the model the app shows its own translated
 * template for each step kind with the same facts. Copy tells the crew, and never claims anyone
 * contacted emergency services.
 */
import { z } from 'zod';

export const HELP_PROBLEMS = ['hurt', 'lost_stolen', 'lost', 'missed_ride'] as const;
export const helpProblemSchema = z.enum(HELP_PROBLEMS);
export type HelpProblem = z.infer<typeof helpProblemSchema>;

export const CHECKLIST_STEP_KINDS = [
  'nearest_facility',
  'call_number',
  'phrase',
  'insurance_line',
  'ops_clinic',
  'freeze_cards',
  'police_report',
  'embassy',
  'share_pin',
  'stay_put',
  'walk_back',
  'ride_quote',
  'driver_message',
] as const;
export const checklistStepKindSchema = z.enum(CHECKLIST_STEP_KINDS);
export type ChecklistStepKind = z.infer<typeof checklistStepKindSchema>;

export const checklistStepSchema = z.object({
  id: z.string(),
  kind: checklistStepKindSchema,
  /** The only facts the step may state: names, numbers and minutes from the catalogue. */
  facts: z.record(z.string(), z.union([z.string(), z.number()])),
  /** The step in plain English: the model's starting point, never shown as is to a VI reader. */
  template: z.string(),
  /** The guide's wording in the traveller's language; `null` = show the app's own template. */
  text: z.string().nullable(),
});
export type ChecklistStep = z.infer<typeof checklistStepSchema>;

export interface ChecklistFacts {
  readonly general: string;
  readonly police: string | null;
  readonly facility: {
    readonly id: string;
    readonly name: string;
    readonly minutes: number | null;
  } | null;
  readonly embassy: {
    readonly id: string;
    readonly name: string;
    readonly phone: string | null;
  } | null;
  readonly phrase: { readonly key: string; readonly text: string; readonly gloss: string } | null;
}

type Draft = Omit<ChecklistStep, 'id' | 'text'>;

const step = (kind: ChecklistStepKind, template: string, facts: Draft['facts'] = {}): Draft => ({
  kind,
  template,
  facts,
});

function facilityStep(facts: ChecklistFacts): Draft | null {
  const f = facts.facility;
  if (f === null) return null;
  return f.minutes === null
    ? step('nearest_facility', `Go to ${f.name}.`, { facility_id: f.id, name: f.name })
    : step('nearest_facility', `Go to ${f.name}, ${f.minutes} min by car.`, {
        facility_id: f.id,
        name: f.name,
        minutes: f.minutes,
      });
}

function phraseStep(facts: ChecklistFacts): Draft | null {
  const p = facts.phrase;
  if (p === null) return null;
  return step('phrase', `Show them: "${p.text}" (${p.gloss}).`, {
    phrase_key: p.key,
    phrase: p.text,
    gloss: p.gloss,
  });
}

function embassyStep(facts: ChecklistFacts): Draft | null {
  const e = facts.embassy;
  if (e === null) return null;
  return e.phone === null
    ? step('embassy', `If your passport is gone, contact ${e.name}.`, {
        facility_id: e.id,
        name: e.name,
      })
    : step('embassy', `If your passport is gone, call ${e.name} on ${e.phone}.`, {
        facility_id: e.id,
        name: e.name,
        phone: e.phone,
      });
}

function drafts(problem: HelpProblem, facts: ChecklistFacts): (Draft | null)[] {
  const call = step('call_number', `If it's serious, call ${facts.general}.`, {
    number: facts.general,
  });
  switch (problem) {
    case 'hurt':
      return [
        facilityStep(facts),
        phraseStep(facts),
        call,
        step(
          'insurance_line',
          "Call your insurer's assistance line; the number is on your policy card.",
        ),
        step('ops_clinic', 'The ops desk can call the clinic with you.'),
      ];
    case 'lost_stolen':
      return [
        step('freeze_cards', "Freeze your cards in your bank's app first."),
        facts.police === null
          ? step(
              'police_report',
              'Report it to the police and ask for a written report for your insurer.',
            )
          : step(
              'police_report',
              `Report it to the police (${facts.police}) and ask for a written report for your insurer.`,
              { number: facts.police },
            ),
        embassyStep(facts),
        phraseStep(facts),
      ];
    case 'lost':
      return [
        step('share_pin', 'Share where you are so the crew can find you.'),
        step('stay_put', 'Stay where you are, somewhere safe and easy to spot.'),
        step('walk_back', 'Or walk back to your last planned stop.'),
        phraseStep(facts),
      ];
    case 'missed_ride':
      return [
        step('ride_quote', 'Get a ride quote and book the next car.'),
        step('driver_message', 'Your guide can draft a message to your driver; you send it.'),
        phraseStep(facts),
      ];
  }
}

/** The curated steps for `problem`, each with a stable id (`<problem>.<kind>`). */
export function buildChecklist(problem: HelpProblem, facts: ChecklistFacts): ChecklistStep[] {
  return drafts(problem, facts)
    .filter((draft): draft is Draft => draft !== null)
    .map((draft) => ({ ...draft, id: `${problem}.${draft.kind}`, text: null }));
}

/** Which facilities lead a problem's checklist: medical (clinic or hospital) or an embassy. */
export const PROBLEM_FACILITY_KIND: Readonly<Record<HelpProblem, 'medical' | 'embassy' | null>> = {
  hurt: 'medical',
  lost_stolen: 'embassy',
  lost: null,
  missed_ride: null,
};
