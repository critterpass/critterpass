/**
 * A Help problem's checklist from what the phone holds: the curated steps
 * (`buildChecklist` in @cp/domain) filled with the country's numbers, the nearest medical facility
 * or the embassy on file and the problem's phrase. The server's version (worded by the guide) wins
 * when it answers; offline the app words each step from its own translated templates.
 */
import {
  buildChecklist,
  HELP_PHRASE_SLUGS,
  phraseKeysFor,
  phraseLanguageFor,
  PROBLEM_FACILITY_KIND,
  type ChecklistStep,
  type HelpPhrase,
  type HelpProblem,
} from '@cp/domain';

import { nearestMedical, type HubModel } from './help-model';

function problemPhrase(model: HubModel, problem: HelpProblem): HelpPhrase | null {
  const keys = phraseKeysFor(phraseLanguageFor(model.country), HELP_PHRASE_SLUGS[problem]);
  for (const key of keys) {
    const found = model.phrases.find((phrase) => phrase.key === key);
    if (found !== undefined) return found;
  }
  return null;
}

export function localChecklist(model: HubModel, problem: HelpProblem): ChecklistStep[] {
  const lead = PROBLEM_FACILITY_KIND[problem];
  const medical = lead === 'medical' ? nearestMedical(model.facilities) : null;
  const embassy =
    lead === 'embassy' ? (model.facilities.find((f) => f.kind === 'embassy') ?? null) : null;
  const police = model.lines.find((line) => line.service === 'police')?.number ?? null;
  const phrase = problemPhrase(model, problem);
  return buildChecklist(problem, {
    general: model.general.number,
    police,
    facility:
      medical === null ? null : { id: medical.id, name: medical.name, minutes: medical.minutes },
    embassy: embassy === null ? null : { id: embassy.id, name: embassy.name, phone: embassy.phone },
    phrase: phrase === null ? null : { key: phrase.key, text: phrase.text, gloss: phrase.gloss },
  });
}

/** Without a staffed desk there is no "the ops desk can call the clinic with you" step. */
export function withDesk(steps: readonly ChecklistStep[], desk: boolean): ChecklistStep[] {
  return desk ? [...steps] : steps.filter((step) => step.kind !== 'ops_clinic');
}

export function checklistPhrase(model: HubModel, problem: HelpProblem): HelpPhrase | null {
  return problemPhrase(model, problem);
}
