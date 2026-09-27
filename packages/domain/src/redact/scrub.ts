/**
 * One scrubber for every sink that could carry personal data out of a process: Sentry
 * `beforeSend`/`beforeBreadcrumb`, pino `redact.paths`, Langfuse input masking and the analytics
 * prop guard (docs/code-standards.md §11). Keys that name sensitive data are masked wherever they
 * appear; string values that look like an email, phone number, bearer token, JWT or card number
 * are masked even under innocent keys. Servers add the C3/C4 column list from the privacy registry
 * (`extraKeys`), which this package cannot import.
 */
export const REDACTED = '[redacted]';

/** Key names (lower-cased, `-` read as `_`) whose values never leave the process. */
export const SENSITIVE_KEY_PATTERN =
  /(^|_)(authorization|cookie|set_cookie|x_api_key|api_key|apikey|password|passwd|secret|token|access_token|refresh_token|id_token|otp|code_verifier|signature|x_signature|session|email|phone|phone_number|msisdn|name|first_name|last_name|full_name|display_name|address|postcode|lat|lng|lon|latitude|longitude|coords|body|text|message|content|prompt|reply|note|notes|comment|diet|dietary|allergies|budget_max|amount|amount_minor|passport|dob|birthdate)($|_)/u;

const VALUE_PATTERNS: readonly RegExp[] = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu,
  /(?<![\w-])\+\d[\d\s().-]{6,}\d/gu,
  /\b\d{4}(?:[ -]?\d{4}){3}\b/gu,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/gu,
];

export interface RedactOptions {
  /** Additional exact key names to mask (C3/C4 columns from the privacy registry). */
  readonly extraKeys?: readonly string[];
  /** Depth after which nested values are replaced wholesale. */
  readonly maxDepth?: number;
}

const normalise = (key: string) => key.toLowerCase().replaceAll('-', '_');

export function isSensitiveKey(key: string, extraKeys?: ReadonlySet<string>): boolean {
  const normalised = normalise(key);
  return SENSITIVE_KEY_PATTERN.test(normalised) || (extraKeys?.has(normalised) ?? false);
}

/** Masks personal-looking substrings inside a free string. */
export function redactString(value: string): string {
  return VALUE_PATTERNS.reduce((text, pattern) => text.replace(pattern, REDACTED), value);
}

/** Drops the query string and fragment of a URL-ish string (they may carry tokens). */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/u);
  return cut === -1 ? url : url.slice(0, cut);
}

/** Deep copy of `value` with sensitive keys masked and sensitive-looking strings scrubbed. */
export function redact<T>(value: T, options: RedactOptions = {}): T {
  const extra = new Set((options.extraKeys ?? []).map(normalise));
  const maxDepth = options.maxDepth ?? 8;
  const seen = new WeakSet<object>();
  const walk = (node: unknown, depth: number): unknown => {
    if (typeof node === 'string') return redactString(node);
    if (node === null || typeof node !== 'object') return node;
    if (node instanceof Date) return node;
    if (depth >= maxDepth || seen.has(node)) return REDACTED;
    seen.add(node);
    if (Array.isArray(node)) return node.map((child) => walk(child, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node)) {
      out[key] = isSensitiveKey(key, extra) ? REDACTED : walk(child, depth + 1);
    }
    return out;
  };
  return walk(value, 0) as T;
}

/** pino `redact.paths` for the given keys, at the top level and two objects deep. */
export function redactPaths(keys: readonly string[]): string[] {
  return keys.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);
}

/** Base keys every pino logger redacts, before the privacy-registry columns are added. */
export const BASE_LOG_REDACT_KEYS = [
  'authorization',
  'cookie',
  'password',
  'token',
  'otp',
  'email',
  'phone',
  'phone_number',
  'body',
  'text',
  'prompt',
  'budget_max',
  'lat',
  'lng',
] as const;

/** Replaces user-written text with its length only (Langfuse inputs, logs of prompts). */
export function maskUserText(text: string): string {
  return `[user text: ${text.length} chars]`;
}
