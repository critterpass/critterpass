/**
 * Calendar OAuth routes (docs/api-contracts.md §5.5, doc delta):
 * - `GET /v1/calendar/oauth/{provider}/start?device_id&tentative` (signed in): mints a session-bound
 *   `state` and a PKCE pair and answers the provider's authorize URL for the in-app browser.
 * - `GET /v1/calendar/oauth/{provider}/callback?code&state` (the provider's redirect): hands the
 *   code back to the app's URL scheme without exchanging it; the app completes with
 *   `connect_calendar`, which checks the state belongs to the same user and device. The code is
 *   worthless without the verifier, which never leaves the server.
 */
import { DomainError, oauthCalendarProviderSchema, type OAuthCalendarProvider } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';
import { authorizeUrl, pkcePair, type CalendarOAuthConfig } from './client';
import type { ProviderGate } from './config';
import { createOAuthState, peekOAuthState, type OAuthStateStore } from './state';

export interface CalendarOAuthRouteDeps {
  readonly sessions: SessionResolver;
  readonly store: OAuthStateStore;
  readonly config: CalendarOAuthConfig | undefined;
  readonly gate: ProviderGate;
}

const startQuery = z.object({
  device_id: z.string().min(1).max(128),
  tentative: z.enum(['0', '1']).optional(),
});
const callbackQuery = z.object({
  code: z.string().min(1).max(4096).optional(),
  state: z.string().min(16).max(128).optional(),
  error: z.string().max(200).optional(),
});

function providerOf(raw: string | undefined): OAuthCalendarProvider {
  const parsed = oauthCalendarProviderSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError('NOT_FOUND', { reason: 'calendar_provider' });
  return parsed.data;
}

/** Throws unless the provider is configured and its flag is on for `uid`. */
export async function assertProviderOn(
  deps: Pick<CalendarOAuthRouteDeps, 'config' | 'gate'>,
  provider: OAuthCalendarProvider,
  uid: string,
): Promise<CalendarOAuthConfig> {
  const config = deps.config;
  if (config === undefined || config.providers[provider] === undefined) {
    throw new DomainError('SUPPLIER_UNAVAILABLE', { reason: 'calendar_provider_unset', provider });
  }
  if (!(await deps.gate(provider, uid))) {
    throw new DomainError('STATE_INVALID', { reason: 'switched_off', provider });
  }
  return config;
}

export function registerCalendarOAuthRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: CalendarOAuthRouteDeps,
): void {
  app.get('/v1/calendar/oauth/:provider/start', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const provider = providerOf(c.req.param('provider'));
    const query = startQuery.parse(c.req.query());
    const config = await assertProviderOn(deps, provider, session.uid);
    const { verifier, challenge } = pkcePair();
    const state = await createOAuthState(deps.store, {
      uid: session.uid,
      device_id: query.device_id,
      provider,
      verifier,
      consent_tentative: query.tentative === '1',
    });
    c.header('Cache-Control', 'no-store');
    return c.json({
      provider,
      state,
      authorize_url: authorizeUrl(config, provider, state, challenge),
    });
  });

  app.get('/v1/calendar/oauth/:provider/callback', async (c) => {
    const provider = providerOf(c.req.param('provider'));
    const query = callbackQuery.parse(c.req.query());
    const scheme = deps.config?.appScheme ?? 'critterpass';
    const back = new URL(`${scheme}://setup/calendar/connected`);
    back.searchParams.set('provider', provider);
    const live =
      query.state !== undefined && (await peekOAuthState(deps.store, query.state, provider));
    if (!live || query.code === undefined || query.error !== undefined) {
      back.searchParams.set('status', query.error === 'access_denied' ? 'denied' : 'failed');
    } else {
      back.searchParams.set('status', 'authorized');
      back.searchParams.set('state', query.state ?? '');
      back.searchParams.set('code', query.code);
    }
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');
    return c.redirect(back.toString(), 302);
  });
}
