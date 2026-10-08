/**
 * Mailbox connection routes (docs/api-contracts.md §5.5, doc delta), behind each provider's
 * `mailbox.<provider>` flag and configuration:
 * - `GET /v1/mailbox/oauth/{provider}/start?device_id` (signed in): a session-bound state and a
 *   PKCE pair; answers the provider's authorize URL for the system browser;
 * - `GET /v1/mailbox/oauth/{provider}/callback?code&state`: hands the code back to the app's URL
 *   scheme without exchanging it (`connect_mailbox` completes it; the verifier never leaves here);
 * - `GET /v1/mailbox/connections` (signed in): the owner's connections and their status, never a
 *   token or a cursor.
 */
import { withUser } from '@cp/db';
import {
  appLinkSchemeUrl,
  DomainError,
  mailboxConnectedLink,
  mailboxProviderSchema,
  type MailboxConnectionWire,
  type MailboxProvider,
  type OAuthReturn,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { pkcePair } from '../calendar-oauth/client';
import type { OAuthStateStore } from '../calendar-oauth/state';
import {
  createMailboxState,
  mailboxAuthorizeUrl,
  peekMailboxState,
  type MailboxOAuthConfig,
} from '../bookings/mailbox-client';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';

/** Whether a provider's connect flow is on for a user (its PostHog flag, default off). */
export type MailboxGate = (provider: MailboxProvider, uid: string) => Promise<boolean>;

export interface MailboxRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly store: OAuthStateStore;
  readonly config: MailboxOAuthConfig | undefined;
  readonly gate: MailboxGate;
}

function providerOf(raw: string | undefined): MailboxProvider {
  const parsed = mailboxProviderSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError('NOT_FOUND', { reason: 'mailbox_provider' });
  return parsed.data;
}

/** Throws unless the provider is configured and switched on for `uid`. */
export async function assertMailboxOn(
  deps: Pick<MailboxRouteDeps, 'config' | 'gate'>,
  provider: MailboxProvider,
  uid: string,
): Promise<MailboxOAuthConfig> {
  const config = deps.config;
  if (config?.providers[provider] === undefined) {
    throw new DomainError('SUPPLIER_UNAVAILABLE', { reason: 'mailbox_provider_unset', provider });
  }
  if (!(await deps.gate(provider, uid))) {
    throw new DomainError('STATE_INVALID', { reason: 'switched_off', provider });
  }
  return config;
}

const startQuery = z.object({ device_id: z.string().min(1).max(128) });
const callbackQuery = z.object({
  code: z.string().min(1).max(4096).optional(),
  state: z.string().min(16).max(128).optional(),
  error: z.string().max(200).optional(),
});

export function registerMailboxRoutes(app: OpenAPIHono<AppEnv>, deps: MailboxRouteDeps): void {
  app.get('/v1/mailbox/oauth/:provider/start', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const provider = providerOf(c.req.param('provider'));
    const { device_id: deviceId } = startQuery.parse(c.req.query());
    const config = await assertMailboxOn(deps, provider, session.uid);
    const { verifier, challenge } = pkcePair();
    const state = await createMailboxState(deps.store, {
      uid: session.uid,
      device_id: deviceId,
      provider,
      verifier,
    });
    c.header('Cache-Control', 'no-store');
    return c.json({
      provider,
      state,
      authorize_url: mailboxAuthorizeUrl(config, provider, state, challenge),
    });
  });

  app.get('/v1/mailbox/oauth/:provider/callback', async (c) => {
    const provider = providerOf(c.req.param('provider'));
    const query = callbackQuery.parse(c.req.query());
    const live =
      query.state !== undefined && (await peekMailboxState(deps.store, query.state, provider));
    const outcome: OAuthReturn =
      !live || query.code === undefined || query.error !== undefined
        ? { status: query.error === 'access_denied' ? 'denied' : 'failed' }
        : { status: 'authorized', state: query.state ?? '', code: query.code };
    const back = appLinkSchemeUrl(
      deps.config?.appScheme ?? 'critterpass',
      mailboxConnectedLink(provider, outcome),
    );
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');
    return c.redirect(back, 302);
  });

  app.get('/v1/mailbox/connections', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const connections = await withUser(deps.pool, session.uid, 'mailbox', async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        provider: MailboxProvider;
        status: string;
        last_scan_at: Date | null;
      }>('SELECT id, provider, status, last_scan_at FROM mailbox_connections ORDER BY provider');
      return rows.map((row): MailboxConnectionWire => ({
        connection_id: row.id,
        provider: row.provider,
        status: row.status,
        last_scan_at: row.last_scan_at?.toISOString() ?? null,
      }));
    });
    c.header('Cache-Control', 'private, no-store');
    return c.json({ connections });
  });
}
