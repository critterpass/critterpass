/**
 * The port the order flow books activities through: search, hold, book, status, cancel quote and
 * cancel, exactly the Viator adapter's capabilities (packages/suppliers/src/viator/adapter.ts).
 * Commands never reach Viator any other way, and never while the `viator_booking` partner switch
 * is off. The adapter exists only where the deployment has a Viator key (Full + Booking access);
 * without one every order command answers `SUPPLIER_UNAVAILABLE` and the app shows Viator links.
 */
import {
  createViatorAdapter,
  VIATOR_SANDBOX_URL,
  type SupplierHttp,
  type ViatorAdapter,
} from '@cp/suppliers';

import type { SupplierEnv } from './link-config';

export type ActivityBookingPort = Pick<
  ViatorAdapter,
  'search' | 'hold' | 'book' | 'status' | 'cancelQuote' | 'cancel'
>;

export function viatorPortFromEnv(
  env: SupplierEnv,
  http: SupplierHttp,
): ActivityBookingPort | undefined {
  const apiKey = env['VIATOR_API_KEY'];
  const hostingUrl = env['VIATOR_PAYMENT_ORIGIN'];
  if (!apiKey || !hostingUrl) return undefined;
  return createViatorAdapter({
    http,
    config: { apiKey, baseUrl: env['VIATOR_API_BASE_URL'] || VIATOR_SANDBOX_URL, hostingUrl },
  });
}
