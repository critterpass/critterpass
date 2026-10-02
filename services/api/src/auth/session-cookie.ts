/**
 * The session cookie the api's own sign-in routes hand back (the returning phone sign-in, the
 * merge): written exactly as a Better Auth sign-in on this deployment writes it.
 */
import type { Context } from 'hono';

import { signBetterAuthSessionCookie } from './merge/execute';

/** Matches ./config.ts's session.expiresIn (Better Auth's own 30-day sliding session). */
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

/** Better Auth's own session cookie for this deployment: its name and whether it is `Secure`. */
export interface SessionCookieDescriptor {
  readonly name: string;
  readonly attributes: { readonly secure: boolean };
}

export async function sessionCookieOf(auth: {
  readonly $context: Promise<unknown>;
}): Promise<SessionCookieDescriptor> {
  const context = (await auth.$context) as {
    authCookies: { sessionToken: SessionCookieDescriptor };
  };
  return context.authCookies.sessionToken;
}

/**
 * Over https the cookie's name carries the `__Secure-` prefix, and that is the only name the
 * server reads back. A cookie under the bare name is ignored there, and the caller would stay on
 * the session it had.
 */
export function setSessionCookieHeader(
  c: Context,
  token: string,
  secret: string,
  cookie: SessionCookieDescriptor,
): void {
  const signedCookie = encodeURIComponent(signBetterAuthSessionCookie(token, secret));
  const secure = cookie.attributes.secure ? '; Secure' : '';
  c.header(
    'set-cookie',
    `${cookie.name}=${signedCookie}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${THIRTY_DAYS_SECONDS}`,
  );
}
