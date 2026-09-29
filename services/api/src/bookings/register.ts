/**
 * Everything the bookings area mounts on the api, in one call from the entry file: the booking
 * commands (with the keyring barcodes are sealed with), the offline bundle, and the budget
 * forecast's booked-cost provider. Routes that need secrets register only when they are set.
 */
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import { registerBookingCommands } from '../commands/bookings';
import type { FieldKeyring } from '../commands/bookings/deps';
import type { CommandRegistry } from '../commands/_framework/registry';
import type { SessionResolver } from '../commands/_framework/session';
import { mediaSigningConfigFromEnv, type MediaSigningConfig } from '../media/sign';
import { registerBookedCosts } from './booked-costs';
import { registerOfflineBundleRoute } from './offline-bundle';

export interface BookingsDoors {
  readonly pool: pg.Pool;
  readonly registry: CommandRegistry;
  readonly sessions: SessionResolver;
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
  auth: unknown,
  env: BookingsEnv = process.env,
): void {
  void auth;
  registerBookingCommands(doors.registry, { keyring });
  registerBookedCosts();
  registerOfflineBundleRoute(app, { ...doors, keyring, signing: signingFromEnv(env) });
}
