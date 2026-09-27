/**
 * Wraps Better Auth's own `/link-social` and `/phone-number/verify` responses to translate "this
 * identity already belongs to someone else" into `MERGE_REQUIRED` + a merge ticket
 * (docs/api-contracts.md §5.1; this phase's Requirements table: "the ticket is minted only inside
 * that failed `linkSocial` / OTP-verify response"). This runs one layer above Better Auth's own
 * `hooks.after`, on purpose: Better Auth's dispatch pipeline (`better-auth/dist/api/dispatch.mjs`,
 * verified against the installed 1.7.6 source) keeps the *original* handler result's HTTP status
 * even when `hooks.after` substitutes a different response body, so an after-hook can change what a
 * failure says but never its status code — unusable for turning a 400/409 Better Auth error into a
 * 409 `MERGE_REQUIRED` with a different body. Wrapping the already-produced `Response` here sidesteps
 * that entirely, with full control over both.
 */
import { decodeJwt } from 'jose';

import { DomainError } from '@cp/domain';

import type { AuthInstance } from '../config';

import { mintMergeTicket, type MergeTicketProvider } from './ticket';

const LINK_SOCIAL_PATH = '/link-social';
const PHONE_VERIFY_PATH = '/phone-number/verify';

interface AccountKeyLookupAdapter {
  findAccountByKey(key: {
    providerId: string;
    accountId: string;
  }): Promise<{ userId: string } | null>;
}

interface UserByFieldAdapter {
  findMany(query: {
    model: string;
    where: Array<{ field: string; value: string }>;
  }): Promise<ReadonlyArray<{ id: string }>>;
}

interface AuthInternalContext {
  readonly internalAdapter: AccountKeyLookupAdapter;
  readonly adapter: UserByFieldAdapter;
}

export interface MergeInterceptDeps {
  readonly auth: AuthInstance;
  readonly secret: string;
}

function jsonErrorResponse(status: number, ticket: string, original: Response): Response {
  const headers = new Headers(original.headers);
  headers.set('content-type', 'application/json');
  return new Response(
    JSON.stringify(new DomainError('MERGE_REQUIRED', { ticket }).toResponseBody()),
    {
      status,
      headers,
    },
  );
}

function isProvenSocialConflict(
  requestBody: unknown,
): { provider: MergeTicketProvider; sub: string } | undefined {
  const body = requestBody as { provider?: string; idToken?: { token?: string } } | undefined;
  const provider = body?.provider;
  const token = body?.idToken?.token;
  if ((provider !== 'apple' && provider !== 'google') || !token) return undefined;
  const { sub } = decodeJwt(token);
  return typeof sub === 'string' ? { provider, sub } : undefined;
}

/**
 * Wraps `auth.handler`: every response passes through untouched except a `SOCIAL_ACCOUNT_ALREADY_LINKED`
 * on `/link-social` or a `PHONE_NUMBER_EXIST` on `/phone-number/verify` from an authenticated
 * (necessarily anonymous — that is the only session that can hit either conflict) session, which
 * become `MERGE_REQUIRED` + a freshly minted ticket instead.
 */
export function wrapHandlerWithMergeIntercept(
  handler: (request: Request) => Promise<Response>,
  deps: MergeInterceptDeps,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const pathname = new URL(request.url).pathname;
    const isLinkSocial = pathname.endsWith(LINK_SOCIAL_PATH);
    const isPhoneVerify = pathname.endsWith(PHONE_VERIFY_PATH);
    if (!isLinkSocial && !isPhoneVerify) return handler(request);

    const requestBodyClone = request.clone();
    const response = await handler(request);
    if (response.status < 400 || response.status >= 500) return response;

    let errorBody: { code?: string };
    try {
      errorBody = (await response.clone().json()) as { code?: string };
    } catch {
      return response;
    }

    const conflictCode = isLinkSocial ? 'SOCIAL_ACCOUNT_ALREADY_LINKED' : 'PHONE_NUMBER_EXIST';
    if (errorBody.code !== conflictCode) return response;

    const session = await deps.auth.api.getSession({ headers: request.headers });
    if (!session) return response;
    const context = (await deps.auth.$context) as unknown as AuthInternalContext;

    let requestBody: unknown;
    try {
      requestBody = await requestBodyClone.json();
    } catch {
      return response;
    }

    if (isLinkSocial) {
      const proven = isProvenSocialConflict(requestBody);
      if (!proven) return response;
      const existingAccount = await context.internalAdapter.findAccountByKey({
        providerId: proven.provider,
        accountId: proven.sub,
      });
      if (!existingAccount) return response;
      const ticket = mintMergeTicket(
        {
          kind: 'social',
          provider: proven.provider,
          existingUid: existingAccount.userId,
          anonUid: session.user.id,
          anonSessionId: session.session.id,
        },
        deps.secret,
      );
      return jsonErrorResponse(409, ticket, response);
    }

    const phoneBody = requestBody as
      { phoneNumber?: string; updatePhoneNumber?: boolean } | undefined;
    if (!phoneBody?.updatePhoneNumber || !phoneBody.phoneNumber) return response;
    const existingUsers = await context.adapter.findMany({
      model: 'user',
      where: [{ field: 'phoneNumber', value: phoneBody.phoneNumber }],
    });
    const existingUser = existingUsers[0];
    if (!existingUser) return response;
    const ticket = mintMergeTicket(
      {
        kind: 'phone',
        existingUid: existingUser.id,
        anonUid: session.user.id,
        anonSessionId: session.session.id,
      },
      deps.secret,
    );
    return jsonErrorResponse(409, ticket, response);
  };
}
