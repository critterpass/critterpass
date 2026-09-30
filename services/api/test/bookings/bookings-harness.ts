/**
 * The real stack for the bookings suites: the money harness (Testcontainers Postgres + Redis,
 * Better Auth sessions, the command doors, the money commands) with the booking commands and the
 * offline bundle mounted, a field keyring for barcodes and a media signing key for document URLs.
 */
import { randomBytes } from 'node:crypto';

import { generateUuidV7 } from '@cp/domain';

import { registerOfflineBundleRoute } from '../../src/bookings/offline-bundle';
import { registerBookingCommands } from '../../src/commands/bookings';
import type { CommandRegistry } from '../../src/commands/_framework/registry';
import type { MountSetup } from '../setup/setup-harness';
import type { SignedIn } from '../setup/setup-harness';
import { startMoneyHarness, type MoneyHarness } from '../money/money-harness';

export const keyring = { activeKeyId: 'k1', keys: { k1: randomBytes(32) } };
export const signing = {
  baseUrl: 'https://media.test',
  keyId: 'm1',
  secret: 'media-signing-secret-at-least-32-characters',
};

export function startBookingsHarness(
  extra?: (registry: CommandRegistry) => void,
  mount?: MountSetup,
): Promise<MoneyHarness> {
  return startMoneyHarness(
    (registry) => {
      registerBookingCommands(registry, { keyring });
      extra?.(registry);
    },
    (app, deps) => {
      registerOfflineBundleRoute(app, { ...deps, keyring, signing });
      mount?.(app, deps);
    },
  );
}

/** A `booking_doc` media key the member owns (the upload itself is the media area's). */
export function docKey(member: SignedIn): string {
  return `u/${member.uid}/booking_doc/${generateUuidV7()}`;
}

export async function get(
  harness: MoneyHarness,
  session: SignedIn,
  path: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await harness.request(path, { headers: { cookie: session.cookie } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}
