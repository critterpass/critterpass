/**
 * Grounding (docs/api-contracts.md §6, master numbers rule): the model may only name ids that a
 * tool returned in this turn, and every number, time and price in structured output must match a
 * value a tool or engine produced. Collected per turn from validated tool outputs; structured
 * output that fails is rejected (the caller repairs once, then falls back to fixed copy), and
 * free-text numbers no tool produced are flagged for the validator-failure metric and evals.
 *
 * Web search results are cite-only: a number or time a web page states may appear in a chat answer
 * (shown with its source), but it is never a tool fact, so structured output, plan changes and
 * cost-engine inputs can never be grounded on it.
 */

/** Keys whose values are ids the model may only repeat, never invent. */
const ID_KEYS =
  /^(id|uid|.+_id|.+_ids|.+_uid|offer_ref|vendor_ref|deep_link_ref|audio_ref|snapshot_id)$/u;
/** Structured-output keys holding money, counts or durations that must come from a tool. */
const NUMBER_KEYS =
  /(_minor|^price.*|^amount.*|^minutes$|^eta_min$|^distance_m$|^rate$|_c$|_mm$|_m$)/u;
/** Structured-output keys holding clock times or instants. */
const TIME_KEYS = /(_at$|^time$|^start$|^end$|^sched$|^est$|^when$|_deadline$)/u;

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/u;
const CLOCK = /^(\d{1,2}):(\d{2})$/u;

export interface GroundingSet {
  readonly ids: ReadonlySet<string>;
  readonly numbers: ReadonlySet<number>;
  /** Minutes after midnight, wall clock of the value's own offset. */
  readonly clockMinutes: ReadonlySet<number>;
}

export type GroundingViolationKind = 'unknown_id' | 'unverified_number' | 'unverified_time';

export interface GroundingViolation {
  readonly kind: GroundingViolationKind;
  readonly path: string;
  readonly value: string | number;
}

function clockOf(value: string): number | undefined {
  const match = ISO_INSTANT.exec(value) ?? CLOCK.exec(value);
  if (match === null) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Collects the ids, numbers and times of every tool output (and engine value) in a turn. */
export function collectGrounding(outputs: readonly unknown[]): GroundingSet {
  const ids = new Set<string>();
  const numbers = new Set<number>();
  const clockMinutes = new Set<number>();
  const walk = (node: unknown, key: string): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child, key);
    } else if (node !== null && typeof node === 'object') {
      for (const [childKey, child] of Object.entries(node)) walk(child, childKey);
    } else if (typeof node === 'number') {
      numbers.add(node);
      // Minor units are also worded in major units (1250 minor = 12.50).
      numbers.add(node / 100);
      // A distance in metres is also worded in km, to one decimal (4130 m = 4.1 km).
      if (/(^|_)distance_m$/u.test(key)) numbers.add(Math.round(node / 100) / 10);
    } else if (typeof node === 'string') {
      if (ID_KEYS.test(key)) ids.add(node);
      for (const id of node.match(UUID) ?? []) ids.add(id.toLowerCase());
      const clock = clockOf(node);
      if (clock !== undefined) clockMinutes.add(clock);
    }
  };
  for (const output of outputs) walk(output, '');
  return { ids, numbers, clockMinutes };
}

/** Tools whose results are outside text: quotable with their source, never facts. */
export const CITE_ONLY_TOOLS: ReadonlySet<string> = new Set(['web_search']);

export interface ToolOutputEntry {
  readonly name: string;
  readonly output: unknown;
}

/** The facts of a turn's tool results: every tool output except cite-only ones. */
export function collectToolGrounding(entries: readonly ToolOutputEntry[]): GroundingSet {
  return collectGrounding(
    entries.filter((entry) => !CITE_ONLY_TOOLS.has(entry.name)).map((entry) => entry.output),
  );
}

function stringsIn(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(stringsIn);
  if (node !== null && typeof node === 'object') return Object.values(node).flatMap(stringsIn);
  return [];
}

/**
 * Numbers and clock times written in cite-only results (web pages): chat text may quote them, with
 * the sources the answer carries; nothing else may use them. No ids: a web page names none of ours.
 */
export function collectCitedGrounding(entries: readonly ToolOutputEntry[]): GroundingSet {
  const numbers = new Set<number>();
  const clockMinutes = new Set<number>();
  for (const text of entries
    .filter((e) => CITE_ONLY_TOOLS.has(e.name))
    .flatMap((e) => stringsIn(e.output))) {
    for (const clock of textClocks(text)) clockMinutes.add(clock.minutes);
    for (const match of text.matchAll(TEXT_NUMBER)) {
      for (const value of readings(match[1] ?? '')) numbers.add(value);
    }
  }
  return { ids: new Set(), numbers, clockMinutes };
}

/** Merges sets, e.g. tool outputs with the ids and numbers of the trip context and question. */
export function mergeGrounding(...sets: readonly GroundingSet[]): GroundingSet {
  return {
    ids: new Set(sets.flatMap((s) => [...s.ids])),
    numbers: new Set(sets.flatMap((s) => [...s.numbers])),
    clockMinutes: new Set(sets.flatMap((s) => [...s.clockMinutes])),
  };
}

/** Checks every id, number and time in a structured output against the turn's grounding set. */
export function validateStructured(output: unknown, grounding: GroundingSet): GroundingViolation[] {
  const violations: GroundingViolation[] = [];
  const walk = (node: unknown, key: string, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, key, `${path}[${index}]`));
    } else if (node !== null && typeof node === 'object') {
      for (const [childKey, child] of Object.entries(node)) {
        walk(child, childKey, path === '' ? childKey : `${path}.${childKey}`);
      }
    } else if (typeof node === 'string' && ID_KEYS.test(key)) {
      if (!grounding.ids.has(node) && !grounding.ids.has(node.toLowerCase())) {
        violations.push({ kind: 'unknown_id', path, value: node });
      }
    } else if (typeof node === 'string' && TIME_KEYS.test(key)) {
      const clock = clockOf(node);
      if (clock !== undefined && !grounding.clockMinutes.has(clock)) {
        violations.push({ kind: 'unverified_time', path, value: node });
      }
    } else if (typeof node === 'number' && NUMBER_KEYS.test(key) && !grounding.numbers.has(node)) {
      violations.push({ kind: 'unverified_number', path, value: node });
    }
  };
  walk(output, '', '');
  return violations;
}

const TEXT_NUMBER = /(?<![\w.,])(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?![\w])/gu;
const TEXT_CLOCK = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b|\b(\d{1,2})\s*(am|pm)\b/giu;

/** Clock times written in text ("20:30", "8:30 pm", "9am"), as minutes after midnight. */
function textClocks(text: string): { readonly whole: string; readonly minutes: number }[] {
  return [...text.matchAll(TEXT_CLOCK)].map((match) => {
    const [whole, h1, m1, ap1, h2, ap2] = match;
    let hours = Number(h1 ?? h2);
    const half = (ap1 ?? ap2)?.toLowerCase();
    if (half === 'pm' && hours < 12) hours += 12;
    if (half === 'am' && hours === 12) hours = 0;
    return { whole, minutes: hours * 60 + Number(m1 ?? 0) };
  });
}

/** Readings of one number as written: "65.000" and "65,000" are 65000, "12.50" is 12.5. */
function readings(raw: string): number[] {
  const values = new Set<number>();
  if (/^\d{1,3}([.,]\d{3})+$/u.test(raw)) values.add(Number(raw.replace(/[.,]/gu, '')));
  values.add(Number(raw.replace(',', '.')));
  return [...values].filter(Number.isFinite);
}

/**
 * Numbers and clock times in free text that no tool produced. Small counts (0-12) are left alone:
 * "2 people", "day 3" are wording, not facts. Flags, never rewrites: the text is the model's.
 */
export function unverifiedTextNumbers(text: string, grounding: GroundingSet): GroundingViolation[] {
  const violations: GroundingViolation[] = [];
  const clocks = new Set<string>();
  for (const clock of textClocks(text)) {
    clocks.add(clock.whole);
    if (!grounding.clockMinutes.has(clock.minutes)) {
      violations.push({ kind: 'unverified_time', path: 'text', value: clock.whole.trim() });
    }
  }
  const withoutClocks = [...clocks]
    .reduce((rest, clock) => rest.replace(clock, ' '), text)
    .replace(UUID, ' ')
    .replace(/\d{4}-\d{2}-\d{2}/gu, ' ');
  for (const match of withoutClocks.matchAll(TEXT_NUMBER)) {
    const raw = match[1] ?? '';
    const values = readings(raw);
    if (values.every((value) => Number.isInteger(value) && value <= 12)) continue;
    if (!values.some((value) => grounding.numbers.has(value))) {
      violations.push({ kind: 'unverified_number', path: 'text', value: raw });
    }
  }
  for (const id of text.match(UUID) ?? []) {
    if (!grounding.ids.has(id.toLowerCase())) {
      violations.push({ kind: 'unknown_id', path: 'text', value: id });
    }
  }
  return violations;
}
