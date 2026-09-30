/**
 * The worker's side of the api's internal billing door (`POST /internal/billing/{op}`): billing
 * steps run in the api, which owns the RevenueCat client and the entitlement materialiser; the
 * job keeps the durable retry. A 422 is a step that can never succeed (recorded, not retried);
 * anything else that is not a 2xx throws, so pg-boss retries it.
 */
import {
  BILLING_INTERNAL_SECRET_HEADER,
  type BillingInternalBody,
  type BillingInternalOp,
} from '@cp/domain';

export type DoorOutcome =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly code: string; readonly detail: unknown };

export interface BillingDoor {
  call<Op extends BillingInternalOp>(op: Op, body: BillingInternalBody<Op>): Promise<DoorOutcome>;
}

export interface BillingDoorOptions {
  /** The api over the private network, e.g. `http://api.railway.internal:8787`. */
  readonly baseUrl: string;
  readonly secret: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

export class BillingDoorError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`billing door answered ${status} ${code}`);
    this.name = 'BillingDoorError';
  }
}

export function createBillingDoor(options: BillingDoorOptions): BillingDoor {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/u, '');
  return {
    async call(op, body) {
      const response = await doFetch(`${base}/internal/billing/${op}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [BILLING_INTERNAL_SECRET_HEADER]: options.secret,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
      });
      const json = (await response.json().catch(() => ({}))) as {
        result?: unknown;
        error?: { code?: string; detail?: unknown };
      };
      if (response.ok) return { ok: true, result: json.result };
      const code = json.error?.code ?? 'INTERNAL';
      if (response.status === 422) return { ok: false, code, detail: json.error?.detail };
      throw new BillingDoorError(response.status, code);
    },
  };
}
