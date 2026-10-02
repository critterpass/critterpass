/**
 * An SOS as the screen shows it (3k-10), from the synced incident row: who sent it and when, the
 * sender's words (the guide's summary when it came in time), the "guide's on it" steps (each done
 * only on a real event), who is coming and how far away on foot, and what this person can do.
 * The sender sees their own status; a stale SOS (it reached the server too late to alert anyone)
 * is the sender's alone and asks whether they still need help.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import {
  sosResponseSchema,
  sosStepSchema,
  type SosResponse,
  type SosStep,
  type SosStepKey,
} from '@cp/domain';

export interface SosRow {
  readonly id: string;
  readonly trip_id: string;
  readonly user_id: string;
  readonly status: 'open' | 'responding' | 'resolved' | 'stale';
  readonly preset: string | null;
  readonly body: string | null;
  readonly summary: string | null;
  readonly responder_ids: unknown;
  readonly responses: unknown;
  readonly steps: unknown;
  readonly alerted_count: number;
  readonly escalated_at: string | null;
  readonly false_alarm: number | boolean | null;
  readonly opened_at: string;
  readonly resolved_at: string | null;
}

export interface SosResponder {
  readonly uid: string;
  readonly name: string;
  readonly etaMin: number | null;
  readonly arrived: boolean;
}

export interface SosStepView {
  readonly key: SosStepKey;
  readonly done: boolean;
  readonly n: number | null;
}

export interface SosModel {
  readonly id: string;
  readonly role: 'sender' | 'crew';
  readonly senderName: string;
  readonly openedAt: string;
  readonly state: 'open' | 'resolved' | 'stale';
  readonly falseAlarm: boolean;
  /** Nobody has said they are coming yet (the hero dot blinks). */
  readonly waiting: boolean;
  /** Two minutes passed with nobody coming: the sender is offered to call the local number. */
  readonly escalated: boolean;
  readonly words: string | null;
  readonly preset: string | null;
  readonly steps: readonly SosStepView[];
  readonly responders: readonly SosResponder[];
  readonly seen: number;
  readonly myResponse: SosResponse['state'] | null;
  /**
   * The SOS went out and reached nobody: the sender is alone on the trip (a crew of one, or nobody
   * else travelling). The sender is told so plainly and offered the local number first.
   */
  readonly reachedNobody: boolean;
}

function json(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  const parsed = json(value);
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

export function responsesOf(row: Pick<SosRow, 'responses'>): ReadonlyMap<string, SosResponse> {
  const out = new Map<string, SosResponse>();
  for (const [uid, value] of Object.entries(record(row.responses))) {
    const parsed = sosResponseSchema.safeParse(value);
    if (parsed.success) out.set(uid, parsed.data);
  }
  return out;
}

function stepsOf(row: Pick<SosRow, 'steps'>): ReadonlyMap<string, SosStep> {
  const out = new Map<string, SosStep>();
  for (const [key, value] of Object.entries(record(row.steps))) {
    const parsed = sosStepSchema.safeParse(value);
    if (parsed.success) out.set(key, parsed.data);
  }
  return out;
}

/** The card's rows: sent and the live location always; the desk and insurance only once asked. */
function stepViews(row: SosRow, steps: ReadonlyMap<string, SosStep>): SosStepView[] {
  const view = (key: SosStepKey): SosStepView => {
    const step = steps.get(key);
    return { key, done: step?.state === 'done', n: step?.n ?? null };
  };
  const out = [view('sent')];
  out.push({
    key: 'location_live',
    done: row.status === 'open' || row.status === 'responding',
    n: null,
  });
  if (steps.has('ops_clinic')) out.push(view('ops_clinic'));
  if (steps.has('insurance')) out.push(view('insurance'));
  return out;
}

/** The fan-out ran (or the incident was counted) and alerted nobody. */
function reachedNobody(row: SosRow, steps: ReadonlyMap<string, SosStep>): boolean {
  const sent = steps.get('sent');
  if (sent?.state === 'done') return (sent.n ?? row.alerted_count) === 0;
  return false;
}

export function buildSosModel(
  row: SosRow,
  me: string | null,
  names: ReadonlyMap<string, string>,
): SosModel {
  const responses = responsesOf(row);
  const responders: SosResponder[] = [];
  let seen = 0;
  for (const [uid, response] of responses) {
    if (uid === row.user_id) continue;
    seen += 1;
    if (response.state !== 'coming') continue;
    responders.push({
      uid,
      name: names.get(uid) ?? '',
      etaMin: response.eta_min ?? null,
      arrived: response.arrived_at !== undefined,
    });
  }
  responders.sort((a, b) => (a.etaMin ?? 1e9) - (b.etaMin ?? 1e9) || a.name.localeCompare(b.name));
  const open = row.status === 'open' || row.status === 'responding';
  const state = row.status === 'stale' ? 'stale' : open ? 'open' : 'resolved';
  return {
    id: row.id,
    role: me !== null && me === row.user_id ? 'sender' : 'crew',
    senderName: names.get(row.user_id) ?? '',
    openedAt: row.opened_at,
    state,
    falseAlarm: row.false_alarm === true || row.false_alarm === 1,
    waiting: state === 'open' && responders.length === 0,
    escalated: state === 'open' && responders.length === 0 && row.escalated_at !== null,
    words: row.summary ?? row.body,
    preset: row.preset,
    steps: stepViews(row, stepsOf(row)),
    responders,
    seen,
    myResponse: me === null ? null : (responses.get(me)?.state ?? null),
    reachedNobody: reachedNobody(row, stepsOf(row)),
  };
}
