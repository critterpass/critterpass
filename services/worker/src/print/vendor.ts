/**
 * Prodigi (Print API v4) as the print partner: one order per recipient for a 6×4 postcard, front
 * and back from our print-ready PNGs, budget post. Calls time out at 120 s. The status is read from
 * the order: cancelled is `failed`, a dispatched shipment is `shipped` (with its carrier link),
 * production under way is `printed`, anything else accepted is `sent`.
 */
import type { MailingAddressFields } from '@cp/domain';

import {
  PrintOrderRejected,
  type PrintOrderPlaced,
  type PrintOrderStatus,
  type PrintVendor,
} from './adapter';

export const PRODIGI_SANDBOX_URL = 'https://api.sandbox.prodigi.com/v4.0';
export const PRODIGI_LIVE_URL = 'https://api.prodigi.com/v4.0';
/** Prodigi's 6×4 postcard. */
export const PRODIGI_POSTCARD_SKU = 'GLOBAL-POST-MOH-6X4';
const TIMEOUT_MS = 120_000;

export interface ProdigiConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly sku: string;
  readonly fetch?: typeof fetch;
}

interface ProdigiStage {
  readonly stage?: string;
  readonly details?: Readonly<Record<string, string>>;
}

interface ProdigiShipment {
  readonly status?: string;
  readonly carrier?: { readonly name?: string; readonly service?: string };
  readonly tracking?: { readonly number?: string; readonly url?: string };
  readonly fulfillmentLocation?: unknown;
  readonly dispatchDate?: string;
}

interface ProdigiOrder {
  readonly id: string;
  readonly status?: ProdigiStage;
  readonly shipments?: readonly ProdigiShipment[];
}

interface ProdigiResponse {
  readonly outcome?: string;
  readonly order?: ProdigiOrder;
}

/** What an order's state means for the card. */
export function prodigiStatus(order: ProdigiOrder): PrintOrderStatus {
  const stage = order.status?.stage;
  if (stage === 'Cancelled') return { status: 'failed' };
  const shipped = (order.shipments ?? []).find(
    (shipment) => shipment.status === 'Shipped' || shipment.dispatchDate !== undefined,
  );
  if (shipped !== undefined || stage === 'Complete') {
    return {
      status: 'shipped',
      carrier: shipped?.carrier?.name,
      trackingUrl: shipped?.tracking?.url,
    };
  }
  const details = order.status?.details ?? {};
  if (details['inProduction'] === 'InProgress' || details['inProduction'] === 'Complete') {
    return { status: 'printed' };
  }
  return { status: 'sent' };
}

function recipient(address: MailingAddressFields) {
  return {
    name: address.name,
    address: {
      line1: address.line1,
      ...(address.line2 === undefined || address.line2 === '' ? {} : { line2: address.line2 }),
      postalOrZipCode: address.postal_code ?? '',
      countryCode: address.country,
      townOrCity: address.city,
      ...(address.region === undefined || address.region === ''
        ? {}
        : { stateOrCounty: address.region }),
    },
  };
}

export function createProdigiVendor(config: ProdigiConfig): PrintVendor {
  const doFetch = config.fetch ?? fetch;
  async function call(path: string, init: RequestInit = {}): Promise<ProdigiResponse> {
    const response = await doFetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: { 'X-API-Key': config.apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as ProdigiResponse;
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      throw new PrintOrderRejected(`print order refused: ${response.status} ${body.outcome ?? ''}`);
    }
    if (!response.ok) throw new Error(`print partner unavailable: ${response.status}`);
    return body;
  }
  return {
    name: 'prodigi',
    async createOrder(input): Promise<PrintOrderPlaced> {
      const body = await call('/orders', {
        method: 'POST',
        body: JSON.stringify({
          merchantReference: input.reference,
          idempotencyKey: input.reference,
          shippingMethod: 'Budget',
          ...(input.callbackUrl === undefined ? {} : { callbackUrl: input.callbackUrl }),
          recipient: recipient(input.address),
          items: [
            {
              merchantReference: input.reference,
              sku: config.sku,
              copies: 1,
              sizing: 'fillPrintArea',
              assets: [
                { printArea: 'default', url: input.frontUrl },
                { printArea: 'back', url: input.backUrl },
              ],
            },
          ],
        }),
      });
      const order = body.order;
      if (order === undefined) throw new Error('print partner answered without an order');
      return { ref: order.id, ...prodigiStatus(order) };
    },
    async getStatus(ref) {
      const body = await call(`/orders/${encodeURIComponent(ref)}`);
      if (body.order === undefined) throw new Error('print partner answered without an order');
      return prodigiStatus(body.order);
    },
    async cancel(ref) {
      await call(`/orders/${encodeURIComponent(ref)}/actions/cancel`, { method: 'POST' });
    },
  };
}
