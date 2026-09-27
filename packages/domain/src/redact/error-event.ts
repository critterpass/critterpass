/**
 * Error-report scrubbing shared by every Sentry SDK (react-native, node, browser, cloudflare):
 * request bodies, headers, cookies and query strings are removed outright, the user is reduced to
 * its pseudonymous id, and everything else free-form (extra, contexts, tags, messages,
 * breadcrumbs) passes through `redact`. The shapes are structural so this package needs no Sentry
 * dependency; each SDK's `beforeSend`/`beforeBreadcrumb` calls these.
 */
import { redact, redactString, stripQuery, type RedactOptions } from './scrub';

export interface ScrubbableBreadcrumb {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ScrubbableEvent {
  message?: string;
  request?: {
    url?: string;
    data?: unknown;
    headers?: unknown;
    cookies?: unknown;
    query_string?: unknown;
    [key: string]: unknown;
  };
  user?: { id?: string | number; [key: string]: unknown };
  exception?: { values?: { value?: string; [key: string]: unknown }[] };
  breadcrumbs?: ScrubbableBreadcrumb[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Breadcrumb categories that record what the user typed or read; dropped entirely. */
const DROPPED_CATEGORIES = new Set(['ui.input', 'ui.text', 'clipboard']);
const BODY_KEYS = ['body', 'request_body', 'response_body', 'requestBody', 'responseBody'];

export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(
  crumb: B,
  options: RedactOptions = {},
): B | null {
  if (crumb.category !== undefined && DROPPED_CATEGORIES.has(crumb.category)) return null;
  const next: B = { ...crumb };
  if (typeof next.message === 'string') next.message = redactString(stripQuery(next.message));
  if (next.data !== undefined) {
    const data: Record<string, unknown> = { ...next.data };
    for (const key of BODY_KEYS) delete data[key];
    if (typeof data['url'] === 'string') data['url'] = stripQuery(data['url']);
    if (typeof data['to'] === 'string') data['to'] = stripQuery(data['to']);
    if (typeof data['from'] === 'string') data['from'] = stripQuery(data['from']);
    next.data = redact(data, options);
  }
  return next;
}

/** SDK-generated contexts that describe the runtime, never the person; kept verbatim. */
const SDK_CONTEXTS = new Set([
  'os',
  'runtime',
  'browser',
  'app',
  'trace',
  'culture',
  'cloud_resource',
]);

function scrubContexts(
  contexts: Record<string, unknown>,
  options: RedactOptions,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(contexts)) {
    if (SDK_CONTEXTS.has(key)) out[key] = value;
    else if (key === 'device' && value !== null && typeof value === 'object') {
      // The device name is user-chosen ("Anna's iPhone"); model and memory are not personal.
      const { name: _name, ...rest } = value as Record<string, unknown>;
      out[key] = rest;
    } else out[key] = redact(value, options);
  }
  return out;
}

export function scrubErrorEvent<E extends ScrubbableEvent>(
  event: E,
  options: RedactOptions = {},
): E {
  const next: E = { ...event };
  if (next.request !== undefined) {
    const { url, method } = next.request;
    next.request = {
      ...(typeof url === 'string' ? { url: stripQuery(url) } : {}),
      ...(typeof method === 'string' ? { method } : {}),
    };
  }
  if (next.user !== undefined) {
    next.user = next.user.id === undefined ? {} : { id: next.user.id };
  }
  if (typeof next.message === 'string') next.message = redactString(next.message);
  if (next.exception?.values !== undefined) {
    next.exception = {
      ...next.exception,
      values: next.exception.values.map((value) =>
        typeof value.value === 'string' ? { ...value, value: redactString(value.value) } : value,
      ),
    };
  }
  if (next.breadcrumbs !== undefined) {
    next.breadcrumbs = next.breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb, options))
      .filter((crumb): crumb is ScrubbableBreadcrumb => crumb !== null);
  }
  if (next.extra !== undefined) next.extra = redact(next.extra, options);
  if (next.contexts !== undefined) next.contexts = scrubContexts(next.contexts, options);
  if (next.tags !== undefined) next.tags = redact(next.tags, options);
  return next;
}
