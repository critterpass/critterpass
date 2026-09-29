/**
 * Everything the bookings area mounts on the api, in one call from the entry file: the booking
 * commands (with the keyring barcodes are sealed with), the offline bundle, and the budget
 * forecast's booked-cost provider. Routes that need secrets register only when they are set.
 */
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import { registerBookingCommands } from '../commands/bookings';
import { rotateInboundAddressCommand } from '../commands/bookings/rotate-inbound-address';
import { createVerifySenderEmailCommand } from '../commands/bookings/verify-sender-email';
import type { FieldKeyring } from '../commands/bookings/deps';
import type { CommandRegistry } from '../commands/_framework/registry';
import type { SessionResolver } from '../commands/_framework/session';
import { mediaSigningConfigFromEnv, type MediaSigningConfig } from '../media/sign';
import { registerInboundEmailWebhook } from '../routes/webhooks/inbound-email';
import { registerMailboxRoutes, type MailboxGate } from '../routes/mailbox-oauth';
import {
  createConnectMailboxCommand,
  createDisconnectMailboxCommand,
} from '../commands/bookings/connect-mailbox';
import type { OAuthStateStore } from '../calendar-oauth/state';
import { createFlagService } from '../obs/flags';
import { mailboxFlag, userPid } from '@cp/domain';
import { mailboxOAuthConfigFromEnv } from './mailbox-client';
import { registerBookedCosts } from './booked-costs';
import { registerOfflineBundleRoute } from './offline-bundle';
import { betterAuthAccountLookup } from './sender-allow-list';

export interface BookingsDoors {
  readonly pool: pg.Pool;
  readonly registry: CommandRegistry;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient & OAuthStateStore;
  readonly logger: { info(message: string): void };
}

export type BookingsEnv = Readonly<Record<string, string | undefined>>;

function signingFromEnv(env: BookingsEnv): MediaSigningConfig | undefined {
  const baseUrl = env['MEDIA_PUBLIC_BASE_URL'];
  const keysJson = env['MEDIA_HMAC_KEYS'];
  const activeKeyId = env['MEDIA_HMAC_ACTIVE_KID'];
  if (baseUrl === undefined || keysJson === undefined || activeKeyId === undefined) {
    return undefined;
  }
  return mediaSigningConfigFromEnv({ baseUrl, keysJson, activeKeyId });
}

/**
 * `auth` is Better Auth, for matching an inbound sender to a member's verified sign-in email; `env`
 * defaults to the process environment (secret names only in services/api/.env.example).
 */
export function registerBookings(
  app: OpenAPIHono<AppEnv>,
  doors: BookingsDoors,
  keyring: FieldKeyring | undefined,
  auth: { readonly $context: Promise<unknown> },
  env: BookingsEnv = process.env,
): void {
  registerBookingCommands(doors.registry, { keyring });
  doors.registry.register(rotateInboundAddressCommand);
  registerBookedCosts();
  registerOfflineBundleRoute(app, { ...doors, keyring, signing: signingFromEnv(env) });
  registerMailbox(app, doors, keyring, env);
  // Crew forward addresses: the Worker's webhook and the reply-code link need the shared secret
  // and the pepper sender addresses are hashed with.
  const secret = env['INBOUND_EMAIL_HMAC_SECRET'];
  const pepper = env['INBOUND_SENDER_PEPPER'];
  if (secret !== undefined && secret.length >= 32 && pepper !== undefined && pepper.length >= 16) {
    doors.registry.register(createVerifySenderEmailCommand({ pepper, redis: doors.redis }));
    registerInboundEmailWebhook(app, {
      pool: doors.pool,
      secret,
      pepper,
      lookup: betterAuthAccountLookup(auth),
    });
  } else {
    doors.logger.info(
      'Inbound email is disabled: INBOUND_EMAIL_HMAC_SECRET or INBOUND_SENDER_PEPPER is unset',
    );
  }
}

/** The `mailbox.<provider>` flag for one user (PostHog; off when unreachable or unset). */
function mailboxGate(env: BookingsEnv): MailboxGate {
  const flags = createFlagService({
    projectApiKey: env['POSTHOG_PROJECT_API_KEY'],
    flagsSecretKey: env['POSTHOG_PROJECT_SECRET_KEY'],
    host: env['POSTHOG_HOST'],
  });
  const salt = env['ANALYTICS_PID_SALT'];
  return async (provider, uid) => {
    if (salt === undefined || salt.length < 16) return false;
    try {
      const values = await flags.evaluate({ distinctId: await userPid(uid, salt) });
      return values[mailboxFlag(provider)] === true;
    } catch {
      return false;
    }
  };
}

function registerMailbox(
  app: OpenAPIHono<AppEnv>,
  doors: BookingsDoors,
  keyring: FieldKeyring | undefined,
  env: BookingsEnv,
): void {
  const config = mailboxOAuthConfigFromEnv(env, keyring);
  const gate = mailboxGate(env);
  doors.registry.register(createConnectMailboxCommand({ config, gate, store: doors.redis }));
  doors.registry.register(createDisconnectMailboxCommand({ config }));
  registerMailboxRoutes(app, {
    pool: doors.pool,
    sessions: doors.sessions,
    store: doors.redis,
    config,
    gate,
  });
}
