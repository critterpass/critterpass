/**
 * What the organiser's redraft note asks (`redraft.note_intent`), read once per redraft by a typed
 * decision: Jev, or its fast-tier twin through the job's gateway. A decision that cannot be had
 * (route switched off, both models down, no key and no gateway) leaves the labels empty: the guide
 * still reads the note itself, and the day is redone.
 */
import {
  createDecisionClient,
  readRedraftNote,
  recordUsage,
  type AssertRouteOn,
  type DecisionClient,
  type Gateway,
  type RedraftNoteAsk,
  type Telemetry,
  type UsageContext,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import type pg from 'pg';

export type NoteDecisions = Pick<DecisionClient, 'decide'>;

export function redraftNoteDecisions(
  apiKey: string | undefined,
  gateway: Gateway | undefined,
  deps: {
    readonly pool: pg.Pool;
    readonly assertRouteOn: AssertRouteOn;
    readonly telemetry?: Telemetry | undefined;
  },
): NoteDecisions | undefined {
  if (apiKey === undefined && gateway === undefined) return undefined;
  return createDecisionClient({
    apiKey,
    ...(gateway === undefined ? {} : { gateway }),
    onUsage: (record) => recordUsage((fn) => withSystem(deps.pool, fn), record),
    assertRouteOn: (route) => deps.assertRouteOn(route),
    ...(deps.telemetry === undefined ? {} : { telemetry: deps.telemetry }),
  });
}

export async function noteAsks(
  decisions: NoteDecisions | undefined,
  note: string | null,
  usage: UsageContext,
): Promise<RedraftNoteAsk[]> {
  if (decisions === undefined) return [];
  try {
    return await readRedraftNote(decisions, note, usage);
  } catch {
    return [];
  }
}
