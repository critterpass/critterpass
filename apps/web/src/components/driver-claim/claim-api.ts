/* eslint-disable lingui/no-unlocalized-strings -- routes, form field names and wire values, not UI copy. */
/**
 * The claim page's server side: reads the key's state from the api and turns the page's plain HTML
 * form posts into the api's public claim calls. No script runs in the driver's browser; every
 * action posts the form and the Worker answers with the next page (or a redirect to the rotated
 * key).
 */
import type { DriverClaimDetails, DriverClaimView } from '@cp/domain';

export type ClaimLang = 'en' | 'id';

export function claimLang(url: URL): ClaimLang {
  return url.searchParams.get('lang') === 'id' ? 'id' : 'en';
}

export interface ClaimApi {
  readonly baseUrl: string;
  readonly key: string;
  readonly clientIp: string | null;
}

export type ClaimResult =
  | { readonly ok: true; readonly body: Record<string, unknown> }
  | { readonly ok: false; readonly status: number; readonly code: string };

export async function callClaimApi(
  api: ClaimApi,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ClaimResult> {
  let response: Response;
  try {
    response = await fetch(
      `${api.baseUrl}/v1/public/driver-claims/${encodeURIComponent(api.key)}${path}`,
      {
        method,
        headers: {
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(api.clientIp === null ? {} : { 'x-cp-client-ip': api.clientIp }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
  } catch {
    return { ok: false, status: 503, code: 'UPSTREAM_TIMEOUT' };
  }
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const code = (json['error'] as { code?: unknown } | undefined)?.code;
    return {
      ok: false,
      status: response.status,
      code: typeof code === 'string' ? code : 'INTERNAL',
    };
  }
  return { ok: true, body: json };
}

function list(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 12);
}

/** The details fields of the claim and change forms. */
export function detailsFromForm(form: FormData): DriverClaimDetails {
  const seats = Number.parseInt(String(form.get('seats') ?? ''), 10);
  const model = String(form.get('vehicle_model') ?? '').trim();
  const price = String(form.get('price_text') ?? '').trim();
  return {
    display_name: String(form.get('display_name') ?? '').trim(),
    areas: list(form.get('areas')),
    languages: list(form.get('languages')),
    ...(model === '' ? {} : { vehicle_model: model }),
    ...(Number.isFinite(seats) && seats > 0 ? { seats } : {}),
    day_trips: form.get('day_trips') === 'on',
    ...(price === '' ? {} : { price_text: price }),
  };
}

export function asView(body: Record<string, unknown>): DriverClaimView {
  return body as unknown as DriverClaimView;
}
