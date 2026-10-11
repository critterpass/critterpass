/**
 * Setup as one checklist, done in any order once the dates are locked: the dates, everyone's free
 * days, the budget, must-dos, how everyone gets there, the route and the rooms. Each row knows who
 * has done their part (faces, never what they entered), and each member has their own part (their
 * max, a must-do, their free days, their way there). Pure: the hook feeds it synced rows.
 */
/* eslint-disable lingui/no-unlocalized-strings -- row keys, never copy. */

export const CHECKLIST_ROWS = [
  'dates',
  'free_days',
  'budget',
  'must_dos',
  'getting_there',
  'route',
  'rooms',
] as const;
export type ChecklistRowKey = (typeof CHECKLIST_ROWS)[number];

/** `waiting`: behind the dates; `off`: does not apply to this trip. */
export type ChecklistRowState = 'done' | 'open' | 'waiting' | 'off';

export interface ChecklistRow {
  readonly key: ChecklistRowKey;
  /** 1-based place in the checklist ("3 of 7"). */
  readonly position: number;
  readonly state: ChecklistRowState;
  /** Members who have done their part of this row, in crew order. */
  readonly done: readonly string[];
  /** Members still to do it, in crew order. */
  readonly missing: readonly string[];
}

export type MemberPartKey = 'max' | 'must_do' | 'free_days' | 'getting_there';

export interface MemberPartRow {
  readonly key: MemberPartKey;
  readonly done: boolean;
}

export interface WayThere {
  readonly mode: string;
  readonly from: string | null;
  readonly arrivesAt: string | null;
  readonly estimateMinor: number | null;
  readonly currency: string | null;
  readonly bookingId: string | null;
}

export interface MemberProgress {
  readonly daysIn: boolean;
  readonly maxIn: boolean;
  readonly way: WayThere | null;
}

export interface ChecklistInputs {
  /** Setup members in crew order. */
  readonly members: readonly string[];
  readonly me: string;
  readonly isOrganiser: boolean;
  readonly isSolo: boolean;
  readonly datesLocked: boolean;
  readonly progress: ReadonlyMap<string, MemberProgress>;
  /** Members who own (or co-own) a must-do. */
  readonly mustDoOwners: ReadonlySet<string>;
  readonly budgetLocked: boolean;
  readonly roomsLocked: boolean;
  /** Trips may have several stops (the route step is switched on). */
  readonly routeOn: boolean;
  /** Stops of the trip (0 or 1: one city). */
  readonly stopCount: number;
}

export interface SetupChecklist {
  readonly rows: readonly ChecklistRow[];
  /** Members who have done all of their own part. */
  readonly ready: readonly string[];
  readonly total: number;
  /** The viewer's own part, in the order the member view lists it. */
  readonly myPart: readonly MemberPartRow[];
  readonly myLeft: number;
  /** The organiser may draft with what is in (the dates are all the guide needs). */
  readonly canDraft: boolean;
}

const NO_PROGRESS: MemberProgress = { daysIn: false, maxIn: false, way: null };

function split(
  members: readonly string[],
  did: (uid: string) => boolean,
): { done: string[]; missing: string[] } {
  const done = members.filter(did);
  return { done, missing: members.filter((uid) => !did(uid)) };
}

/** The budget asks for maxes only from a crew (a solo trip or a crew of one has none). */
function sharesBudget(inputs: ChecklistInputs): boolean {
  return !inputs.isSolo && inputs.members.length >= 2;
}

export function memberPart(inputs: ChecklistInputs, uid: string): MemberPartRow[] {
  const progress = inputs.progress.get(uid) ?? NO_PROGRESS;
  const part: MemberPartRow[] = [];
  if (sharesBudget(inputs)) part.push({ key: 'max', done: progress.maxIn });
  part.push({ key: 'must_do', done: inputs.mustDoOwners.has(uid) });
  part.push({ key: 'free_days', done: progress.daysIn });
  part.push({ key: 'getting_there', done: progress.way !== null });
  return part;
}

export function setupChecklist(inputs: ChecklistInputs): SetupChecklist {
  const { members } = inputs;
  const of = (uid: string) => inputs.progress.get(uid) ?? NO_PROGRESS;
  const everyone = (did: (uid: string) => boolean) => {
    const parts = split(members, did);
    return { ...parts, state: (parts.missing.length === 0 ? 'done' : 'open') as ChecklistRowState };
  };
  const rowFor = (key: ChecklistRowKey): Omit<ChecklistRow, 'key' | 'position'> => {
    if (key === 'dates') {
      return { state: inputs.datesLocked ? 'done' : 'open', done: [], missing: [] };
    }
    if (!inputs.datesLocked) return { state: 'waiting', done: [], missing: [] };
    switch (key) {
      case 'free_days':
        return everyone((uid) => of(uid).daysIn);
      case 'budget': {
        if (!sharesBudget(inputs)) return { state: 'off', done: [], missing: [] };
        const parts = split(members, (uid) => of(uid).maxIn);
        return { ...parts, state: inputs.budgetLocked ? 'done' : 'open' };
      }
      case 'must_dos':
        return everyone((uid) => inputs.mustDoOwners.has(uid));
      case 'getting_there':
        return everyone((uid) => of(uid).way !== null);
      case 'route':
        if (!inputs.routeOn) return { state: 'off', done: [], missing: [] };
        return { state: inputs.stopCount >= 2 ? 'done' : 'open', done: [], missing: [] };
      case 'rooms':
        if (inputs.isSolo || members.length < 2) return { state: 'off', done: [], missing: [] };
        return { state: inputs.roomsLocked ? 'done' : 'open', done: [], missing: [] };
    }
  };
  const rows = CHECKLIST_ROWS.map((key, index) => ({ key, position: index + 1, ...rowFor(key) }));
  const ready = members.filter((uid) => memberPart(inputs, uid).every((part) => part.done));
  const myPart = memberPart(inputs, inputs.me);
  return {
    rows,
    ready,
    total: members.length,
    myPart,
    myLeft: myPart.filter((part) => !part.done).length,
    canDraft: inputs.isOrganiser && inputs.datesLocked,
  };
}

/** The day tiles of the draft strip: each trip day, sketched or still waiting. */
export function sketchTiles(
  lengthDays: number | null,
  sketched: readonly number[],
): { readonly dayNo: number; readonly sketched: boolean }[] {
  const days = Math.max(0, lengthDays ?? 0);
  const done = new Set(sketched);
  return Array.from({ length: days }, (_, index) => ({
    dayNo: index + 1,
    sketched: done.has(index + 1),
  }));
}
