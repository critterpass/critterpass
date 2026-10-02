/**
 * The flight-delayed screen (3k-5) worked out from the synced `disruptions` row: the hero (delay,
 * cancellation, diversion, missed connection), the guide's rows split into what is already done,
 * what is still on its way, what needs a yes and what went wrong, who may answer each question,
 * and who may tell the crew or undo everything. Pure: the screen feeds it rows and the signed-in
 * member, the view renders the result.
 */
import {
  disruptionActionsSchema,
  disruptionAffectedSchema,
  type DisruptionAction,
  type DisruptionAffected,
} from '@cp/domain';

export type FlightCause = 'delay' | 'cancelled' | 'diverted' | 'missed_connection';

export interface DisruptionRowData {
  readonly id: string;
  readonly trip_id: string;
  readonly kind: string;
  readonly cause: string;
  readonly status: string;
  readonly version: number;
  readonly title: string;
  readonly summary: string;
  readonly affected: string | null;
  readonly facts: string | null;
  readonly actions: string | null;
  readonly i18n: string | null;
  readonly ref_id: string | null;
}

export interface Person {
  readonly id: string;
  readonly name: string;
}

export type RowGroup = 'done' | 'working' | 'question' | 'problem' | 'link' | 'gone';

export interface Question {
  readonly action: DisruptionAction;
  /** The members the answer concerns, in crew order. */
  readonly affected: readonly Person[];
  /** The signed-in member may answer it (affected, and the poll is still open). */
  readonly canAnswer: boolean;
  /** Who answered it, once someone did. */
  readonly decidedBy: Person | null;
  readonly closesAt: string | null;
}

export interface FlightModel {
  readonly cause: FlightCause;
  readonly delayMin: number | null;
  readonly facts: Readonly<Record<string, string | number>>;
  readonly status: 'open' | 'resolved' | 'withdrawn' | 'undone';
  readonly version: number;
  readonly done: readonly DisruptionAction[];
  readonly working: readonly DisruptionAction[];
  readonly questions: readonly Question[];
  readonly problems: readonly DisruptionAction[];
  readonly links: readonly DisruptionAction[];
  readonly undone: readonly DisruptionAction[];
  readonly affected: DisruptionAffected;
  readonly mine: boolean;
  /** TELL THE CREW: an organiser or one of the delayed travellers. */
  readonly canAnnounce: boolean;
  /** Undo everything: an organiser or a delayed traveller, while anything can still be taken back. */
  readonly canUndo: boolean;
}

const GROUPS: Readonly<Record<DisruptionAction['state'], RowGroup>> = {
  done: 'done',
  confirmed: 'done',
  planned: 'working',
  running: 'working',
  approved: 'working',
  sent: 'working',
  waiting_vendor: 'working',
  needs_yes: 'question',
  draft_ready: 'question',
  failed: 'problem',
  no_answer: 'problem',
  declined: 'problem',
  link: 'link',
  kept: 'gone',
  withdrawn: 'gone',
  undone: 'gone',
};

function parse<T>(text: string | null, read: (value: unknown) => T, fallback: T): T {
  if (text === null || text === '') return fallback;
  try {
    return read(JSON.parse(text) as unknown);
  } catch {
    return fallback;
  }
}

function causeOf(cause: string): FlightCause {
  return cause === 'cancelled' || cause === 'diverted' || cause === 'missed_connection'
    ? cause
    : 'delay';
}

/* eslint-disable lingui/no-unlocalized-strings -- state names, never copy. */
const STATUSES = new Set(['open', 'resolved', 'withdrawn', 'undone']);
const WAITING = new Set(['needs_yes', 'draft_ready', 'waiting_vendor', 'approved']);
const ANSWERED = new Set(['approved', 'kept']);
/* eslint-enable lingui/no-unlocalized-strings */

export function flightModel(
  row: DisruptionRowData,
  me: string | null,
  people: readonly Person[],
  organiser: boolean,
): FlightModel {
  const actions = parse(row.actions, (value) => disruptionActionsSchema.parse(value), []);
  const affected = parse(row.affected, (value) => disruptionAffectedSchema.parse(value), {
    traveller_ids: [],
    item_stable_ids: [],
    unaffected_ids: [],
  });
  const facts = parse(
    row.facts,
    (value) => (typeof value === 'object' && value !== null ? value : {}),
    {},
  ) as Record<string, string | number>;
  const byId = new Map(people.map((person) => [person.id, person]));
  const person = (id: string): Person => byId.get(id) ?? { id, name: '' };
  const open = row.status === 'open';
  const grouped = actions.map((action) => ({ action, group: GROUPS[action.state] }));
  // A question stays a card once answered ("Maya approved"), instead of joining the rows below.
  const asked = grouped.filter(
    (r) =>
      (r.action.decider !== null || r.action.poll !== null) &&
      (r.group === 'question' || (r.action.decided_by !== null && ANSWERED.has(r.action.state))),
  );
  const askedIds = new Set(asked.map((r) => r.action.id));
  const of = (group: RowGroup) =>
    grouped.filter((r) => r.group === group && !askedIds.has(r.action.id)).map((r) => r.action);
  const questions = asked.map(({ action }) => ({
    action,
    affected: action.affected_user_ids.map(person),
    canAnswer:
      open &&
      me !== null &&
      action.poll !== null &&
      (action.state === 'needs_yes' || action.state === 'draft_ready') &&
      action.affected_user_ids.includes(me),
    decidedBy: action.decided_by === null ? null : person(action.decided_by),
    closesAt: action.decider?.closes_at ?? null,
  }));
  const reversible = actions.some(
    (action) =>
      (action.state === 'done' && action.reversible) ||
      action.state === 'sent' ||
      action.state === 'confirmed' ||
      WAITING.has(action.state),
  );
  const delay = facts['delay_min'];
  return {
    cause: causeOf(row.cause),
    delayMin: typeof delay === 'number' ? delay : null,
    facts,
    status: STATUSES.has(row.status) ? (row.status as FlightModel['status']) : 'open',
    version: row.version,
    done: of('done'),
    working: of('working'),
    questions,
    problems: of('problem'),
    links: of('link'),
    undone: actions.filter((action) => action.state === 'undone'),
    affected,
    mine: me !== null && affected.traveller_ids.includes(me),
    canAnnounce: open && me !== null && (organiser || affected.traveller_ids.includes(me)),
    canUndo:
      open && me !== null && reversible && (organiser || affected.traveller_ids.includes(me)),
  };
}

/** "2h 10m" from minutes; null below a minute. */
export function delayParts(minutes: number | null): { hours: number; minutes: number } | null {
  if (minutes === null || minutes < 1) return null;
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}
