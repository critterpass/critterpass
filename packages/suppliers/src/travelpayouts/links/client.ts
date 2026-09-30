/**
 * Travelpayouts partner links API (`POST /links/v1/create`): turns a partner's own page (Agoda,
 * Trip.com, Klook, GetYourGuide, Kiwitaxi, GetTransfer) into our affiliate link carrying the
 * account's marker, the project (`trs`) subscribed to that brand, and the click's opaque sub id.
 * Long links only (`shorten: false`), so the link names the partner domain it lands on.
 *
 * A brand the project is not subscribed to answers per link with `code: failed`: the caller hides
 * that partner's call to action (`SUPPLIER_UNAVAILABLE`), it never shows an unattributed link.
 * The token travels in the `X-Access-Token` header only.
 */
import { z } from 'zod';

import { supplierUnavailable } from '../../core/errors';
import { SupplierHttpError, type SupplierHttp } from '../../core/http';

export const TRAVELPAYOUTS_LINKS_SUPPLIER = 'travelpayouts';
const LINKS_ENDPOINT = 'links_create';
const DEFAULT_BASE_URL = 'https://api.travelpayouts.com';
/** The API converts at most ten links per request. */
export const MAX_LINKS_PER_REQUEST = 10;

export interface TravelpayoutsLinksConfig {
  readonly token: string;
  /** The account's partner id. */
  readonly marker: number;
  /** The project subscribed to the brand programmes. */
  readonly trs: number;
  readonly baseUrl?: string;
}

const linkResultSchema = z.object({
  url: z.string(),
  code: z.string(),
  message: z.string().optional(),
  partner_url: z.string(),
});

const createResponseSchema = z.object({
  result: z.object({ links: z.array(linkResultSchema) }),
  code: z.string(),
});

export interface PartnerLinkRequest {
  readonly url: string;
  readonly subId: string;
}

export type PartnerLinkResult =
  | { readonly ok: true; readonly url: string; readonly partnerUrl: string }
  | { readonly ok: false; readonly url: string; readonly reason: 'not_subscribed' | 'unsupported' };

function failureReason(message: string | undefined): 'not_subscribed' | 'unsupported' {
  return message !== undefined && /not subscribed/i.test(message)
    ? 'not_subscribed'
    : 'unsupported';
}

/** Converts up to ten partner pages into affiliate links, one result per request, in order. */
export async function createPartnerLinks(
  http: SupplierHttp,
  config: TravelpayoutsLinksConfig,
  links: readonly PartnerLinkRequest[],
): Promise<readonly PartnerLinkResult[]> {
  if (links.length === 0) return [];
  if (links.length > MAX_LINKS_PER_REQUEST) {
    throw new RangeError(`at most ${MAX_LINKS_PER_REQUEST} links per request`);
  }
  let body: z.infer<typeof createResponseSchema>;
  try {
    body = await http.sendJson(
      {
        supplier: TRAVELPAYOUTS_LINKS_SUPPLIER,
        endpoint: LINKS_ENDPOINT,
        url: new URL('/links/v1/create', config.baseUrl ?? DEFAULT_BASE_URL),
        method: 'POST',
        headers: { 'X-Access-Token': config.token, Accept: 'application/json' },
        body: JSON.stringify({
          trs: config.trs,
          marker: config.marker,
          shorten: false,
          links: links.map((link) => ({ url: link.url, sub_id: link.subId })),
        }),
        timeoutMs: 10_000,
      },
      createResponseSchema,
    );
  } catch (error) {
    // A refused marker, project or token is our account's configuration, not the traveller's.
    if (error instanceof SupplierHttpError && error.status !== null && error.status < 500) {
      throw supplierUnavailable(TRAVELPAYOUTS_LINKS_SUPPLIER, 'configuration');
    }
    throw error;
  }
  return links.map((link, index) => {
    const result = body.result.links[index];
    if (result?.code === 'success' && result.partner_url.startsWith('https://')) {
      return { ok: true, url: link.url, partnerUrl: result.partner_url };
    }
    return { ok: false, url: link.url, reason: failureReason(result?.message) };
  });
}
