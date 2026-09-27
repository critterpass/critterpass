/**
 * The app's side of the link endpoints (docs/api-contracts.md §5.6): link previews for the router's
 * state check, and `POST /v1/links/claim` for first-launch attribution. HTTP goes through an
 * injected transport (the signed-in auth client in the app), so this stays a pure helper; every
 * failure is a value, never a throw, because a slow or offline api must never block the splash.
 */
import {
  claimAttributionResultSchema,
  generateUuidV7,
  linkPreviewSchema,
  type ClaimAttributionPayload,
  type ClaimAttributionResult,
  type LinkPreview,
  type LinkTarget,
} from '@cp/domain';

export interface LinksHttpResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Signed-in transport: resolves every HTTP status (including 4xx); rejects only on network loss. */
export interface LinksHttp {
  request(input: {
    readonly method: 'GET' | 'POST';
    readonly path: string;
    readonly body?: unknown;
  }): Promise<LinksHttpResponse>;
}

export interface ClaimDevice {
  /** The install id (`X-CP-Install-Id`), a UUID; attribution is one per install. */
  readonly id: string;
  readonly platform: 'ios' | 'android';
  readonly app_version: string;
  readonly tz: string;
}

export type PreviewResult =
  | { readonly status: 'found'; readonly preview: LinkPreview }
  | { readonly status: 'not_found' }
  | { readonly status: 'unavailable' };

export type ClaimResult =
  | { readonly status: 'claimed'; readonly result: ClaimAttributionResult }
  | { readonly status: 'rejected'; readonly code: string }
  | { readonly status: 'unavailable' };

function previewPath(target: Extract<LinkTarget, { kind: 'invite' | 'referral' }>): string {
  const query = [`kind=${target.kind}`];
  if (target.kind === 'invite' && target.seat !== undefined) query.push(`seat=${target.seat}`);
  return `/v1/links/${encodeURIComponent(target.code)}/preview?${query.join('&')}`;
}

function errorCode(body: unknown): string {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : 'INTERNAL';
}

export function createLinkResolverClient(http: LinksHttp) {
  return {
    /** Only invites and referral codes have server-side state; other kinds resolve locally. */
    async preview(target: LinkTarget): Promise<PreviewResult> {
      if (target.kind !== 'invite' && target.kind !== 'referral') return { status: 'unavailable' };
      try {
        const response = await http.request({ method: 'GET', path: previewPath(target) });
        if (response.status === 404) return { status: 'not_found' };
        const parsed = linkPreviewSchema.safeParse(response.body);
        return response.status === 200 && parsed.success
          ? { status: 'found', preview: parsed.data }
          : { status: 'unavailable' };
      } catch {
        return { status: 'unavailable' };
      }
    },

    async claim(payload: ClaimAttributionPayload, device: ClaimDevice): Promise<ClaimResult> {
      const opId = generateUuidV7();
      const envelope = {
        op_id: opId,
        cmd: 'claim_attribution',
        v: 1,
        // The server overwrites the actor with the session's own uid.
        actor: { uid: opId, via: 'app' },
        device,
        client_ts: new Date().toISOString(),
        payload,
      };
      try {
        const response = await http.request({
          method: 'POST',
          path: '/v1/links/claim',
          body: envelope,
        });
        if (response.status >= 500 || response.status === 429) return { status: 'unavailable' };
        if (response.status !== 200) return { status: 'rejected', code: errorCode(response.body) };
        const parsed = claimAttributionResultSchema.safeParse(
          (response.body as { result?: unknown } | null)?.result,
        );
        return parsed.success
          ? { status: 'claimed', result: parsed.data }
          : { status: 'unavailable' };
      } catch {
        return { status: 'unavailable' };
      }
    },
  };
}

export type LinkResolverClient = ReturnType<typeof createLinkResolverClient>;
