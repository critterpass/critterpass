/* eslint-disable lingui/no-unlocalized-strings -- header names and URL paths, not UI copy. */
/**
 * Server-side preview fetch for a link page (`GET /v1/links/{token}/preview`). Passes the visitor's
 * IP and user agent with the shared proxy secret, so the api rate-limits and bot-filters the
 * visitor rather than this Worker. Never blocks a page for long: on a slow or failing api the page
 * still renders its handoff without a preview.
 */
import { linkPreviewSchema, type LinkChannel, type LinkPreview, type LinkTarget } from '@cp/domain';

export type PreviewOutcome =
  | { readonly status: 'found'; readonly preview: LinkPreview }
  | { readonly status: 'not_found' }
  | { readonly status: 'unavailable' };

export interface PreviewRequest {
  readonly apiBaseUrl: string;
  readonly target: LinkTarget;
  readonly channel: LinkChannel | null;
  readonly visitorIp: string | null;
  readonly visitorUserAgent: string | null;
  readonly proxySecret: string | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

/** Kinds the api can preview today; other kinds render a generic handoff without asking. */
export function previewable(
  target: LinkTarget,
): target is Extract<LinkTarget, { kind: 'invite' | 'referral' }> {
  return target.kind === 'invite' || target.kind === 'referral';
}

export async function fetchLinkPreview(request: PreviewRequest): Promise<PreviewOutcome> {
  const { target } = request;
  if (!previewable(target)) return { status: 'unavailable' };
  const query = new URLSearchParams({ kind: target.kind });
  if (target.kind === 'invite' && target.seat !== undefined) query.set('seat', target.seat);
  if (request.channel !== null) query.set('c', request.channel);
  const url = `${request.apiBaseUrl}/v1/links/${encodeURIComponent(target.code)}/preview?${query.toString()}`;

  const headers = new Headers({ accept: 'application/json' });
  if (request.proxySecret !== undefined && request.proxySecret !== '') {
    headers.set('x-cp-web-proxy', request.proxySecret);
    if (request.visitorIp !== null) headers.set('x-cp-visitor-ip', request.visitorIp);
    if (request.visitorUserAgent !== null) headers.set('x-cp-visitor-ua', request.visitorUserAgent);
  }

  try {
    const response = await (request.fetchImpl ?? fetch)(url, {
      headers,
      signal: AbortSignal.timeout(request.timeoutMs ?? 2500),
    });
    if (response.status === 404) return { status: 'not_found' };
    if (!response.ok) return { status: 'unavailable' };
    const parsed = linkPreviewSchema.safeParse(await response.json());
    return parsed.success ? { status: 'found', preview: parsed.data } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
