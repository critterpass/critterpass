/**
 * The purchase flow every paywall and boost sheet drives, as a pure state machine:
 *
 *   idle → purchasing → verifying → done
 *                     ↘ pending (Ask to Buy, SCA) → verifying when the store listener sees it land
 *                     ↘ cancelled | failed
 *   verifying → background when the server has not confirmed within the budget: the store took the
 *   money, so the UI says "finishing up" and `entitlement.changed` moves it to done later.
 *
 * The store charge is never repeated from here: retry after `failed` starts a new purchase only
 * when the store said nothing was charged (`store_failed`); a failed verification retries the
 * verification, not the charge.
 */
import type { FulfilPurchaseResult, ProductKey } from '@cp/domain';

/** How long the UI waits on the server's confirmation before moving on (`background`). */
export const VERIFY_BUDGET_MS = 5_000;

export type PurchaseState =
  | { readonly status: 'idle' }
  | { readonly status: 'purchasing'; readonly productKey: ProductKey }
  | { readonly status: 'pending'; readonly productKey: ProductKey }
  | {
      readonly status: 'verifying';
      readonly productKey: ProductKey;
      readonly transactionId: string;
    }
  | {
      readonly status: 'background';
      readonly productKey: ProductKey;
      readonly transactionId: string;
    }
  | {
      readonly status: 'done';
      readonly productKey: ProductKey;
      readonly passPlus: boolean;
      readonly boostId: string | null;
    }
  | { readonly status: 'cancelled'; readonly productKey: ProductKey }
  | {
      readonly status: 'failed';
      readonly productKey: ProductKey;
      /** `store` = nothing was charged; `verify` = charged, the server has not confirmed yet. */
      readonly stage: 'store' | 'verify';
      readonly code: string;
      readonly transactionId?: string;
    };

export type PurchaseEvent =
  | { readonly type: 'start'; readonly productKey: ProductKey }
  | { readonly type: 'store_success'; readonly transactionId: string }
  | { readonly type: 'store_pending' }
  | { readonly type: 'store_cancelled' }
  | { readonly type: 'store_failed'; readonly code: string }
  | { readonly type: 'listener_success'; readonly transactionId: string }
  | { readonly type: 'verified'; readonly result: FulfilPurchaseResult }
  | { readonly type: 'verify_failed'; readonly code: string }
  | { readonly type: 'verify_timeout' }
  | { readonly type: 'entitlement_changed' }
  | { readonly type: 'retry_verify' }
  | { readonly type: 'reset' };

export const IDLE: PurchaseState = { status: 'idle' };

/** True while a purchase owns the sheet: back and close are disabled, no second purchase starts. */
export function isPurchaseBusy(state: PurchaseState): boolean {
  return state.status === 'purchasing' || state.status === 'verifying';
}

export function purchaseTransition(state: PurchaseState, event: PurchaseEvent): PurchaseState {
  if (event.type === 'reset') return isPurchaseBusy(state) ? state : IDLE;
  switch (state.status) {
    case 'idle':
    case 'cancelled':
      return event.type === 'start'
        ? { status: 'purchasing', productKey: event.productKey }
        : state;
    case 'failed':
      if (event.type === 'start' && state.stage === 'store') {
        return { status: 'purchasing', productKey: event.productKey };
      }
      if (event.type === 'retry_verify' && state.stage === 'verify' && state.transactionId) {
        return verifying(state.productKey, state.transactionId);
      }
      if (event.type === 'entitlement_changed' && state.stage === 'verify') {
        return fromEntitlement(state.productKey);
      }
      return state;
    case 'purchasing':
      switch (event.type) {
        case 'store_success':
          return verifying(state.productKey, event.transactionId);
        case 'store_pending':
          return { status: 'pending', productKey: state.productKey };
        case 'store_cancelled':
          return { status: 'cancelled', productKey: state.productKey };
        case 'store_failed':
          return {
            status: 'failed',
            productKey: state.productKey,
            stage: 'store',
            code: event.code,
          };
        default:
          return state;
      }
    case 'pending':
      if (event.type === 'listener_success') {
        return verifying(state.productKey, event.transactionId);
      }
      if (event.type === 'entitlement_changed') return fromEntitlement(state.productKey);
      return state;
    case 'verifying':
      switch (event.type) {
        case 'verified':
          return event.result.status === 'fulfilled'
            ? done(state.productKey, event.result.pass_plus, event.result.boost_id)
            : { ...state, status: 'background' };
        case 'verify_timeout':
          return { ...state, status: 'background' };
        case 'verify_failed':
          return {
            status: 'failed',
            productKey: state.productKey,
            stage: 'verify',
            code: event.code,
            transactionId: state.transactionId,
          };
        case 'entitlement_changed':
          return fromEntitlement(state.productKey);
        default:
          return state;
      }
    case 'background':
      if (event.type === 'verified' && event.result.status === 'fulfilled') {
        return done(state.productKey, event.result.pass_plus, event.result.boost_id);
      }
      if (event.type === 'entitlement_changed') return fromEntitlement(state.productKey);
      return state;
    case 'done':
      return state;
  }
}

function verifying(productKey: ProductKey, transactionId: string): PurchaseState {
  return { status: 'verifying', productKey, transactionId };
}

/** The server announced new entitlements before answering the verification itself. */
function fromEntitlement(productKey: ProductKey): PurchaseState {
  return done(productKey, productKey === 'pass_monthly' || productKey === 'pass_yearly', null);
}

function done(productKey: ProductKey, passPlus: boolean, boostId: string | null): PurchaseState {
  return { status: 'done', productKey, passPlus, boostId };
}

export interface PurchaseFlowDeps {
  readonly platform: 'app_store' | 'play';
  /** The store charge (RevenueCat). */
  purchase(
    storeProductId: string,
  ): Promise<
    | { readonly kind: 'success'; readonly transactionId: string; readonly productId: string }
    | { readonly kind: 'pending' }
    | { readonly kind: 'cancelled' }
    | { readonly kind: 'failed'; readonly code: string }
  >;
  /** `fulfil_purchase {source: client_sync}`: rejects with the wire error code. */
  fulfil(payload: {
    source: 'client_sync';
    platform: 'app_store' | 'play';
    transaction_id: string;
    store_product_id: string;
    intent_id?: string;
  }): Promise<FulfilPurchaseResult>;
  /** Resolves after `ms`; injectable so tests do not wait. */
  sleep?(ms: number): Promise<void>;
}

/**
 * Runs one purchase through the machine, reporting every state: the store charge, then the
 * server's verification raced against {@link VERIFY_BUDGET_MS}. A verification that loses the race
 * keeps running; its answer still moves `background` to `done`.
 */
export async function runPurchase(
  deps: PurchaseFlowDeps,
  request: { productKey: ProductKey; storeProductId: string; intentId?: string },
  onState: (state: PurchaseState) => void,
): Promise<PurchaseState> {
  let state = purchaseTransition(IDLE, { type: 'start', productKey: request.productKey });
  const step = (event: PurchaseEvent) => {
    state = purchaseTransition(state, event);
    onState(state);
    return state;
  };
  onState(state);
  const outcome = await deps.purchase(request.storeProductId);
  if (outcome.kind === 'pending') return step({ type: 'store_pending' });
  if (outcome.kind === 'cancelled') return step({ type: 'store_cancelled' });
  if (outcome.kind === 'failed') return step({ type: 'store_failed', code: outcome.code });
  step({ type: 'store_success', transactionId: outcome.transactionId });
  return verifyPurchase(
    deps,
    { ...request, transactionId: outcome.transactionId, productId: outcome.productId },
    step,
  );
}

/** The verification half, also used to retry a verification that failed after the charge. */
export async function verifyPurchase(
  deps: PurchaseFlowDeps,
  request: { transactionId: string; productId: string; intentId?: string },
  step: (event: PurchaseEvent) => PurchaseState,
): Promise<PurchaseState> {
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const verification = deps
    .fulfil({
      source: 'client_sync',
      platform: deps.platform,
      transaction_id: request.transactionId,
      store_product_id: request.productId,
      ...(request.intentId ? { intent_id: request.intentId } : {}),
    })
    .then(
      (result) => step({ type: 'verified', result }),
      (error: unknown) => step({ type: 'verify_failed', code: wireCode(error) }),
    );
  const timeout = sleep(VERIFY_BUDGET_MS).then(() => 'timeout' as const);
  const first = await Promise.race([verification, timeout]);
  return first === 'timeout' ? step({ type: 'verify_timeout' }) : first;
}

function wireCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'NETWORK';
}
