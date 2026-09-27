import { expo } from '@better-auth/expo';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { anonymous, jwt, phoneNumber } from 'better-auth/plugins';
import { Hono } from 'hono';
import type pg from 'pg';

import { ensureBetterAuthSchema, computeSpikeAuthTables } from './schema';

const SPIKE_SECRET = 'spike-s-auth-deploy-secret-not-used-for-anything-outside-this-throwaway-run';

/**
 * Real (not mock-IdP) Better Auth config for the "spike-auth" Railway deploy — T3's device half
 * of S-AUTH. Unlike `harness.ts` (T2, `genericOAuth` standing in for a native IdP so the server
 * half could be tested without an Apple/Google developer session), this wires the *real* built-in
 * `apple` social provider so a genuine on-device Sign in with Apple identity token verifies here.
 *
 * `apple`'s idToken-verification path (what `signIn.social({provider:'apple', idToken:{...}})`
 * uses — the native flow, not the web redirect) needs only `clientId`/`appBundleIdentifier` to
 * check the token's audience against Apple's own JWKS; `clientSecret` is required only by the
 * redirect/authorization-code exchange this spike's native flow never takes
 * (`@better-auth/core/src/social-providers/apple.ts`, read directly — not assumed). No `.p8` Sign
 * in with Apple key is provisioned in this environment (see the ADR), so `clientSecret` is left
 * unset here: the idToken path this spike tests does not need it, but the redirect path — and
 * therefore this same config could never drive Apple's server-to-server *revoke* notifications,
 * which need a signed client secret — could not be added without one.
 *
 * Google is deliberately not wired here: the founder has not yet set up a Firebase/Google Cloud
 * project (a recorded account gap), so there is no OAuth client id to configure. The mobile
 * screen still renders a Google button; the real error path is what "founder checklist" resolves.
 */
export function buildDeployAuthOptions(
  pool: pg.Pool,
  capturedOtps: Map<string, string>,
): BetterAuthOptions {
  const appBundleId = process.env['APPLE_APP_BUNDLE_ID'] ?? 'app.critterpass.dev';
  return {
    baseURL: process.env['PUBLIC_BASE_URL'] ?? 'http://localhost:8080',
    secret: SPIKE_SECRET,
    database: pool,
    rateLimit: { enabled: false },
    socialProviders: { apple: { clientId: appBundleId, appBundleIdentifier: appBundleId } },
    // `@better-auth/expo`'s docs (docs/integrations/expo) are explicit that the app's own custom
    // scheme must be a trusted origin — the `expoClient` plugin sends it as a real `Origin`
    // header on every request, which Better Auth otherwise rejects with `INVALID_ORIGIN`
    // (confirmed against this exact deploy: a bare `Origin: critterpass-dev://` curl request
    // 403'd until this was added). `exp://*` covers Expo Go / dev-client's local-IP scheme.
    trustedOrigins: ['critterpass-dev://', 'critterpass-staging://', 'critterpass://', 'exp://*'],
    account: {
      accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: true },
    },
    databaseHooks: {
      account: {
        create: {
          after: async (account: { userId: string }, context: unknown) => {
            const ctx = context as
              { context: { internalAdapter: BetterAuthInternalAdapter } } | undefined;
            if (!ctx) return;
            const user = await ctx.context.internalAdapter.findUserById(account.userId);
            if (user && 'isAnonymous' in user && user['isAnonymous']) {
              await ctx.context.internalAdapter.updateUser(account.userId, { isAnonymous: false });
            }
          },
        },
      },
      verification: {
        create: {
          // Same OTP-capture technique as T2's harness (docs/decisions/20260927-better-auth-
          // anonymous-upgrade.md finding 3): no Twilio Verify account is provisioned, so this
          // reads the code straight from the row the phone plugin itself writes. Exposed over
          // `/internal/spike/otp` (below) so the on-device Maestro flow, which cannot receive a
          // real SMS, can complete the phone-verify step for real.
          after: (verification: { identifier: string; value: string }) => {
            const code = verification.value.split(':')[0];
            if (code) capturedOtps.set(verification.identifier, code);
            return Promise.resolve();
          },
        },
      },
    },
    plugins: [
      anonymous(),
      phoneNumber({
        sendOTP: () => undefined,
        callbackOnVerification: async ({ user }: { user: { id: string } }, ctx: unknown) => {
          const context = ctx as { context: { internalAdapter: BetterAuthInternalAdapter } };
          await context.context.internalAdapter.updateUser(user.id, { isAnonymous: false });
        },
      }),
      jwt({ jwt: { audience: 'rt', expirationTime: '15m' }, jwks: { gracePeriod: 3600 } }),
      expo(),
    ],
  };
}

interface BetterAuthInternalAdapter {
  findUserById(id: string): Promise<{ id: string; isAnonymous?: boolean } | null>;
  updateUser(id: string, data: Record<string, unknown>): Promise<unknown>;
}

export type DeployAuthInstance = ReturnType<typeof betterAuth>;

export async function createDeployAuth(
  pool: pg.Pool,
): Promise<{ auth: DeployAuthInstance; capturedOtps: Map<string, string> }> {
  const capturedOtps = new Map<string, string>();
  const options = buildDeployAuthOptions(pool, capturedOtps);
  await ensureBetterAuthSchema(pool, computeSpikeAuthTables(options));
  return { auth: betterAuth(options), capturedOtps };
}

export function createSpikeAuthApp(
  auth: DeployAuthInstance,
  capturedOtps: Map<string, string>,
): Hono {
  const app = new Hono();
  app.get('/health', (c) => c.json({ ok: true }));
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  // Spike-only debug door: never shipped to production auth (the real auth build sends a real
  // Twilio Verify code, not a capture map). Lets a device that cannot receive a real SMS
  // complete the phone-verify step against this deploy.
  app.get('/internal/spike/otp', (c) => {
    const identifier = c.req.query('identifier');
    if (!identifier) return c.json({ error: 'missing ?identifier=' }, 400);
    const code = capturedOtps.get(identifier);
    return code
      ? c.json({ code })
      : c.json({ error: 'no OTP captured yet for this identifier' }, 404);
  });

  return app;
}
