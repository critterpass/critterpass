/**
 * The auth client's transport with device attestation on the two Better Auth endpoints the api
 * attests (services/api/src/auth/hooks.ts `ATTESTED_PATHS`): anonymous sign-in and OTP send. Every
 * other request passes straight through with no added work. It wraps `fetch` rather than being a
 * fetch plugin because the attestation outcome is read from the same request's response: an App
 * Attest key id is kept only once the api accepted it, and a rejected assertion is retried once
 * with a fresh key.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire paths, never copy. */
import type { Attestor } from '../../lib/attestation';

export const ATTESTED_AUTH_PATHS: readonly string[] = [
  '/sign-in/anonymous',
  '/phone-number/send-otp',
];

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function isAttestedAuthRequest(url: string): boolean {
  const path = new URL(url, 'http://localhost').pathname;
  return ATTESTED_AUTH_PATHS.some((suffix) => path.endsWith(suffix));
}

async function responseErrorCode(response: Response): Promise<string | undefined> {
  if (response.ok) return undefined;
  try {
    const body = (await response.clone().json()) as { error?: { code?: unknown } } | null;
    const code = body?.error?.code;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

export function createAttestedFetch(base: typeof fetch, attestor: Attestor): typeof fetch {
  async function send(
    input: Parameters<typeof fetch>[0],
    init: RequestInit | undefined,
    retriesLeft: number,
  ): Promise<Response> {
    const ticket = await attestor.attest();
    const headers = new Headers(init?.headers);
    for (const [name, value] of Object.entries(ticket.headers)) headers.set(name, value);
    const response = await base(input, { ...init, headers });
    const retry = await ticket.settle({
      ok: response.ok,
      errorCode: await responseErrorCode(response),
    });
    return retry && retriesLeft > 0 ? send(input, init, retriesLeft - 1) : response;
  }

  return (input, init) =>
    isAttestedAuthRequest(requestUrl(input)) ? send(input, init, 1) : base(input, init);
}
