/**
 * The last check before an event leaves any process: the name must be in the catalog, no key may
 * look like personal data, and the props must parse under the event's strict schema (so unknown
 * keys and free-text strings are rejected). Callers drop a rejected event; they never send a
 * "cleaned" copy, because a violation means the call site is wrong.
 */
import {
  getAnalyticsEventSchema,
  isAnalyticsEventName,
  type AnalyticsEventName,
  type AnalyticsEventProps,
} from './catalog';

/** Key fragments that mean personal or sensitive data (code-standards §11, Play Age Signals). */
export const FORBIDDEN_PROP_PATTERNS: readonly RegExp[] = [
  /(^|_)(first_|last_|full_|display_|user)?name($|_)/u,
  /e_?mail/u,
  /phone|msisdn/u,
  /(^|_)(lat|lng|lon|latitude|longitude|coords?|geo)($|_)/u,
  /amount|price|budget_(max|value)|total_minor|minor_units/u,
  /(^|_)(text|body|message|content|prompt|reply|note|comment)($|_)/u,
  /diet|allerg/u,
  /(^|_)(age|birth|dob|age_signal)($|_)/u,
  /address|postcode|zip/u,
  /passport|secret|password|(^|_)(token|otp)$/u,
];

export function isForbiddenPropKey(key: string): boolean {
  const normalised = key.toLowerCase();
  return FORBIDDEN_PROP_PATTERNS.some((pattern) => pattern.test(normalised));
}

export type GuardResult<N extends AnalyticsEventName = AnalyticsEventName> =
  | { readonly ok: true; readonly event: N; readonly properties: AnalyticsEventProps<N> }
  | {
      readonly ok: false;
      readonly reason: 'unknown_event' | 'forbidden_key' | 'invalid_props';
      readonly detail: string;
    };

export function guardAnalyticsEvent(event: string, properties: unknown): GuardResult {
  if (!isAnalyticsEventName(event)) return { ok: false, reason: 'unknown_event', detail: event };
  if (properties !== null && typeof properties === 'object') {
    const forbidden = Object.keys(properties).find(isForbiddenPropKey);
    if (forbidden !== undefined) return { ok: false, reason: 'forbidden_key', detail: forbidden };
  }
  const parsed = getAnalyticsEventSchema(event).safeParse(properties ?? {});
  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.join('.') || issue.code);
    return { ok: false, reason: 'invalid_props', detail: paths.join(',') };
  }
  return { ok: true, event, properties: parsed.data };
}
