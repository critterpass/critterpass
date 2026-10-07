/* eslint-disable lingui/no-unlocalized-strings -- header names and URL paths, not UI copy. */
/**
 * Server-side reads of the api's public previews (`GET /v1/public/{kind}/{token}`): the draft behind
 * a trip invite, the published crew plan behind a plan link and the trip recap behind a recap link. Like the link preview, it passes the visitor's IP and user agent with the shared
 * proxy secret so limits apply to the visitor, is never cached, and never holds a page up: a slow,
 * failing or empty answer leaves the section out.
 */
import {
  publicPlanSchema,
  publicProposalSchema,
  publicRecapSchema,
  type LinkTarget,
  type PublicPlan,
  type PublicProposal,
  type PublicRecap,
} from '@cp/domain';

export interface PublicPreviewRequest {
  readonly apiBaseUrl: string;
  readonly target: LinkTarget;
  readonly visitorIp: string | null;
  readonly visitorUserAgent: string | null;
  readonly proxySecret: string | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

function visitorHeaders(request: PublicPreviewRequest): Headers {
  const headers = new Headers({ accept: 'application/json' });
  if (request.proxySecret !== undefined && request.proxySecret !== '') {
    headers.set('x-cp-web-proxy', request.proxySecret);
    if (request.visitorIp !== null) headers.set('x-cp-visitor-ip', request.visitorIp);
    if (request.visitorUserAgent !== null) headers.set('x-cp-visitor-ua', request.visitorUserAgent);
  }
  return headers;
}

/** The proposal behind an invite link, or null when there is none to show. */
export async function fetchPublicProposal(
  request: PublicPreviewRequest,
): Promise<PublicProposal | null> {
  const { target } = request;
  if (target.kind !== 'invite') return null;
  const query = target.seat === undefined ? '' : `?seat=${encodeURIComponent(target.seat)}`;
  const url = `${request.apiBaseUrl}/v1/public/proposal/${encodeURIComponent(target.code)}${query}`;
  try {
    const response = await (request.fetchImpl ?? fetch)(url, {
      headers: visitorHeaders(request),
      signal: AbortSignal.timeout(request.timeoutMs ?? 2000),
    });
    if (!response.ok) return null;
    const parsed = publicProposalSchema.safeParse(await response.json());
    return parsed.success && parsed.data.days.length > 0 ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * A plan link's page: the published plan, `gone` when the link no longer shows one (revoked, the
 * plan taken down or never published), `unavailable` when the api could not say.
 */
export type PublicPlanOutcome =
  | { readonly status: 'found'; readonly plan: PublicPlan }
  | { readonly status: 'gone' }
  | { readonly status: 'unavailable' };

export async function fetchPublicPlan(request: PublicPreviewRequest): Promise<PublicPlanOutcome> {
  const { target } = request;
  if (target.kind !== 'plan_share') return { status: 'unavailable' };
  const url = `${request.apiBaseUrl}/v1/public/plan/${encodeURIComponent(target.token)}`;
  try {
    const response = await (request.fetchImpl ?? fetch)(url, {
      headers: visitorHeaders(request),
      signal: AbortSignal.timeout(request.timeoutMs ?? 2500),
    });
    if (response.status === 404) return { status: 'gone' };
    if (!response.ok) return { status: 'unavailable' };
    const parsed = publicPlanSchema.safeParse(await response.json());
    return parsed.success ? { status: 'found', plan: parsed.data } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

/**
 * A recap link's page: the recap, `gone` when the link no longer shows one (switched off, or the
 * recap is not ready), `unavailable` when the api could not say.
 */
export type PublicRecapOutcome =
  | { readonly status: 'found'; readonly recap: PublicRecap }
  | { readonly status: 'gone' }
  | { readonly status: 'unavailable' };

export async function fetchPublicRecap(request: PublicPreviewRequest): Promise<PublicRecapOutcome> {
  const { target } = request;
  if (target.kind !== 'recap_share') return { status: 'unavailable' };
  const url = `${request.apiBaseUrl}/v1/public/recap/${encodeURIComponent(target.token)}`;
  try {
    const response = await (request.fetchImpl ?? fetch)(url, {
      headers: visitorHeaders(request),
      signal: AbortSignal.timeout(request.timeoutMs ?? 2500),
    });
    if (response.status === 404) return { status: 'gone' };
    if (!response.ok) return { status: 'unavailable' };
    const parsed = publicRecapSchema.safeParse(await response.json());
    return parsed.success ? { status: 'found', recap: parsed.data } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
