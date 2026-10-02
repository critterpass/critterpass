/**
 * What every Live Activity content contract shares (docs/api-contracts-async.md §3.2): the kinds,
 * the time and hash encodings, and the rules each ContentState must keep. A ContentState travels
 * in an APNs `liveactivity` push (≤4 KB including `aps`) and is decoded by ActivityKit, so:
 * - times are unix seconds (`int`): ActivityKit decodes content-state with the default
 *   `JSONDecoder`, whose `Date` is not unix time, so the Swift side converts;
 * - members appear as short hashes of (object, uid), never as ids;
 * - no coordinates and no budget figures, ever (checked by `assertNoForbiddenFields`).
 */
import { z } from 'zod';

/** Every activity kind, in the order `la.<kind>.enabled` switches list them (plus rides). */
export const LA_KINDS = [
  'leave_by',
  'meet_up',
  'flight',
  'vote',
  'critter_nearby',
  'storm',
  'sos',
  'alarm',
  'ride',
] as const;
export const laKindSchema = z.enum(LA_KINDS);
export type LaKind = z.infer<typeof laKindSchema>;

/**
 * The kinds every shipped iPhone build draws. iOS issues a push-to-start token for each kind the
 * app declares, including kinds its widget extension has no view for, and a push-start of such a
 * kind shows a blank activity. So a build lists the kinds it draws (`la_kinds` on its push-to-start
 * registration) and the server push-starts any other kind only on phones that listed it.
 */
export const LA_BASELINE_IOS_KINDS: readonly LaKind[] = ['leave_by', 'flight', 'alarm'];

/** The attributes field naming the object an activity shows (its `ref_id` on the server). */
export const LA_REF_KEYS: Readonly<Record<LaKind, string>> = {
  leave_by: 'leave_by_id',
  meet_up: 'meetup_id',
  flight: 'segment_id',
  vote: 'poll_id',
  critter_nearby: 'spawn_id',
  storm: 'watch_id',
  sos: 'sos_id',
  alarm: 'leave_by_id',
  ride: 'quote_id',
};

/** The object id in an activity's attributes, or null when the attributes lack it. */
export function laRefId(
  kind: LaKind,
  attributes: Readonly<Record<string, unknown>>,
): string | null {
  const value = attributes[LA_REF_KEYS[kind]];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** A ContentState or attributes payload must fit an APNs push with room for `aps` around it. */
export const LA_CONTENT_BUDGET_BYTES = 3072;

/** Unix seconds: what every timestamp in a ContentState is. */
export const unixSecondsSchema = z.number().int().nonnegative();

export function unixSeconds(at: Date): number {
  return Math.floor(at.getTime() / 1000);
}

/**
 * FNV-1a (32-bit, hex) of `<scope>:<uid>`: a member's stable, short pip key within one object.
 * The Swift side computes the same hash of its own uid to find "me" in a shared (broadcast)
 * ContentState, which cannot name the viewer.
 */
export function laMemberHash(scopeId: string, uid: string): string {
  let hash = 0x811c9dc5;
  const text = `${scopeId}:${uid}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export const memberHashSchema = z.string().regex(/^[0-9a-f]{8}$/);

/** Field names that must never appear in a Live Activity payload (coordinates, budgets). */
const FORBIDDEN_FIELD = /(^|_)(lat|lng|lon|latitude|longitude|coords?|geo|budget|max_spend)(_|$)/;

function shapeOf(schema: z.ZodType): z.ZodType {
  let current = schema;
  for (;;) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap() as z.ZodType;
    } else if (current instanceof z.ZodDefault) {
      current = current.def.innerType as z.ZodType;
    } else {
      return current;
    }
  }
}

/** Every field path of an object schema whose name looks like a coordinate or a budget. */
export function forbiddenFields(schema: z.ZodType, path = ''): string[] {
  const shape = shapeOf(schema);
  if (shape instanceof z.ZodArray) return forbiddenFields(shape.element as z.ZodType, `${path}[]`);
  if (!(shape instanceof z.ZodObject)) return [];
  const found: string[] = [];
  const fields: Record<string, z.ZodType> = shape.shape;
  for (const [key, child] of Object.entries(fields)) {
    const at = path === '' ? key : `${path}.${key}`;
    if (FORBIDDEN_FIELD.test(key)) found.push(at);
    found.push(...forbiddenFields(child, at));
  }
  return found;
}

/** Throws when a content contract names a coordinate or budget field. */
export function assertNoForbiddenFields(name: string, schema: z.ZodType): void {
  const found = forbiddenFields(schema);
  if (found.length > 0) {
    throw new Error(`${name} must not carry coordinates or budgets: ${found.join(', ')}`);
  }
}

/** Clamps text to the length a Live Activity line can show, on a character boundary. */
export function laLine(text: string, max = 80): string {
  const chars = [...text.trim()];
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`;
}
