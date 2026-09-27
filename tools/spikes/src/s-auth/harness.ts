import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { anonymous, genericOAuth, jwt, phoneNumber } from 'better-auth/plugins';
import type pg from 'pg';

import type { MockIdp } from './mock-idp';
import { mergeOwnedRows } from './owned-rows';
import { computeSpikeAuthTables, ensureBetterAuthSchema } from './schema';

// Never used for anything real; only signs cookies/JWKS private keys inside a throwaway
// Testcontainers database that is dropped when the process exits.
const SPIKE_SECRET = 'spike-s-auth-harness-secret-not-used-outside-testcontainers-0000';

/**
 * The account-linking contract this harness proves (docs/system-architecture.md §11 S-AUTH):
 * `linkSocial`/`phoneNumber.verify({updatePhoneNumber:true})` attach a new identity to the
 * *current* session's user id directly, so they keep the uid with no ambiguity. Signing in
 * (not linking) with an identity that already belongs to another user is what the anonymous
 * plugin resolves as a merge: its `onLinkAccount` hook fires with both users so this harness
 * can move `spike_owned` rows before Better Auth deletes the now-redundant anonymous user.
 * Neither path flips `isAnonymous` on its own, so a `databaseHooks.account.create.after`
 * hook and the phone plugin's `callbackOnVerification` do it here — one hook per identity
 * mechanism, same as production would need.
 */
export interface AuthHarnessConfig {
  /**
   * Seconds before a signed JWKS key is replaced by a new one (still valid for verification
   * throughout `gracePeriod`). Only the rotation test (jwks.db.test.ts) sets this — a real
   * value forces rotation inside one test run. Every other consumer (the upgrade/merge tests,
   * S-RT) mints many tokens per run and must keep signing with one stable key throughout, so
   * the default is "never rotate".
   */
  jwksRotationIntervalSeconds?: number;
}

export function buildAuthOptions(
  pool: pg.Pool,
  mockIdp: MockIdp,
  capturedOtps: Map<string, string>,
  config: AuthHarnessConfig = {},
): BetterAuthOptions {
  return {
    baseURL: 'http://localhost:3000',
    secret: SPIKE_SECRET,
    database: pool,
    rateLimit: { enabled: false },
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        // Anonymous users carry a placeholder email (`temp-<id>@anonymous.placeholder.invalid`),
        // which never matches a real identity's email; without this, `/link-social` refuses
        // to attach a real identity to an anonymous session at all (phone linking has no such
        // check). Required for the anonymous-first upgrade to work with social identities.
        allowDifferentEmails: true,
      },
    },
    databaseHooks: {
      account: {
        create: {
          after: async (account, context) => {
            if (!context) return;
            const user = await context.context.internalAdapter.findUserById(account.userId);
            if (user && 'isAnonymous' in user && user['isAnonymous']) {
              await context.context.internalAdapter.updateUser(account.userId, {
                isAnonymous: false,
              });
            }
          },
        },
      },
      verification: {
        create: {
          // Reads the OTP straight from the row the phone plugin itself writes (value is
          // "<code>:<attempts>"), the same place a real Twilio Verify integration's `sendOTP`
          // hook would read it from before dispatching it. No Twilio Verify test account is
          // provisioned yet (a pending account dependency), so this stands in for that call.
          // Sync body, but the hook's declared type requires a real Promise return.
          after: (verification) => {
            if (verification) {
              const code = verification.value.split(':')[0];
              if (code) capturedOtps.set(verification.identifier, code);
            }
            return Promise.resolve();
          },
        },
      },
    },
    plugins: [
      anonymous({
        // Fires for both the no-conflict and the merge-ticket transition; only the merge
        // transition (a *different* pre-existing user) needs rows moved.
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          if (anonymousUser.user.id === newUser.user.id) return;
          await mergeOwnedRows(pool, {
            fromUserId: anonymousUser.user.id,
            toUserId: newUser.user.id,
          });
        },
      }),
      phoneNumber({
        sendOTP: () => undefined,
        callbackOnVerification: async ({ user }, ctx) => {
          if (!ctx) return;
          await ctx.context.internalAdapter.updateUser(user.id, { isAnonymous: false });
        },
      }),
      jwt({
        jwt: { audience: 'rt', expirationTime: '15m' },
        jwks: {
          ...(config.jwksRotationIntervalSeconds !== undefined
            ? { rotationInterval: config.jwksRotationIntervalSeconds }
            : {}),
          gracePeriod: 3600,
        },
      }),
      genericOAuth({
        config: [
          {
            providerId: 'mock-idp',
            clientId: mockIdp.clientId,
            clientSecret: 'unused-by-the-idtoken-flow-this-harness-drives',
            discoveryUrl: `${mockIdp.issuer}/.well-known/openid-configuration`,
            // Native Apple/Google sign-in supplies its own nonce; this harness drives the
            // idToken path directly without the preceding authorize-redirect that would
            // normally carry one.
            disableIdTokenNonceBinding: true,
          },
        ],
      }),
    ],
  };
}

export type BetterAuthInstance = ReturnType<typeof betterAuth>;

export interface SpikeAuthHarness {
  auth: BetterAuthInstance;
  getOtp(identifier: string): string | undefined;
}

/** Builds the config, creates every table it needs on `pool`, and returns a ready instance. */
export async function createAuthHarness(
  pool: pg.Pool,
  mockIdp: MockIdp,
  config: AuthHarnessConfig = {},
): Promise<SpikeAuthHarness> {
  const capturedOtps = new Map<string, string>();
  const options = buildAuthOptions(pool, mockIdp, capturedOtps, config);
  await ensureBetterAuthSchema(pool, computeSpikeAuthTables(options));
  return { auth: betterAuth(options), getOtp: (identifier) => capturedOtps.get(identifier) };
}
