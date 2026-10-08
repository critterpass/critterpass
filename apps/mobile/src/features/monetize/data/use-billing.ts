/**
 * The store and the purchase flow for the monetization screens. The store is RevenueCat for the
 * signed-in person (`null` when this build has no store key, so every screen says purchases are
 * not available yet); a purchase runs the shared machine and nothing is granted here: the server
 * verifies each transaction and the synced entitlement rows are what the app shows.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names and wire codes, never copy. */
import {
  fulfilPurchaseResultSchema,
  type FulfilPurchasePayload,
  type FulfilPurchaseResult,
  type ProductKey,
} from '@cp/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createRevenueCatStore,
  IDLE,
  isPurchaseBusy,
  purchaseTransition,
  restorePurchases,
  runPurchase,
  startPurchaseListener,
  verifyPurchase,
  type PurchaseEvent,
  type PurchaseState,
  type RestoreResult,
  type StorePort,
} from '@/data/billing';
import type { SendResult } from '@/data/commands/client';
import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { useSessionUid } from '@/data/powersync/use-session-uid';

/** A command the server refused or that never reached it, with the wire code. */
export class CommandRefused extends Error {
  constructor(
    readonly code: string,
    readonly detail?: unknown,
  ) {
    super(code);
  }
}

/** The server's answer to an online-only command, or a {@link CommandRefused}. */
export function appliedResult(result: SendResult): unknown {
  if (result.kind === 'applied') return result.result;
  if (result.kind === 'queued') throw new CommandRefused('NETWORK');
  throw new CommandRefused(result.code, result.kind === 'rejected' ? result.detail : undefined);
}

export const fulfilPurchaseCommand = defineClientCommand<FulfilPurchasePayload>({
  name: 'fulfil_purchase',
  offline: false,
});

/** The signed-in uid as the local database knows it; null until bound. */
export function useOwnerUid(): string | null {
  return useSessionUid();
}

/** The store for the signed-in person; `null` when there is none to buy from. */
export function useStore(uid: string | null): StorePort | null {
  return useMemo(() => (uid === null ? null : createRevenueCatStore(uid)), [uid]);
}

export function useFulfil(): (payload: FulfilPurchasePayload) => Promise<FulfilPurchaseResult> {
  const { send } = useCommand(fulfilPurchaseCommand);
  return useCallback(
    async (payload) => fulfilPurchaseResultSchema.parse(appliedResult(await send(payload))),
    [send],
  );
}

export interface PurchaseRequest {
  readonly productKey: ProductKey;
  readonly storeProductId: string;
  readonly intentId?: string;
}

export interface PurchaseControls {
  readonly state: PurchaseState;
  readonly buy: (request: PurchaseRequest) => void;
  /** After a charge the server has not confirmed: asks the server again, never the store. */
  readonly retryVerify: () => void;
  readonly reset: () => void;
}

/**
 * One purchase at a time through the shared machine. While a purchase is waiting on the store
 * (Ask to Buy, a bank check) or on the server, the store listener finishes it when it lands.
 */
export function usePurchase(store: StorePort | null): PurchaseControls {
  const fulfil = useFulfil();
  const [state, setState] = useState<PurchaseState>(IDLE);
  const current = useRef<PurchaseState>(IDLE);
  const request = useRef<PurchaseRequest | null>(null);

  const step = useCallback((event: PurchaseEvent): PurchaseState => {
    current.current = purchaseTransition(current.current, event);
    setState(current.current);
    return current.current;
  }, []);

  const buy = useCallback(
    (next: PurchaseRequest) => {
      if (store === null || isPurchaseBusy(current.current)) return;
      request.current = next;
      void runPurchase(
        { platform: store.platform, purchase: (id) => store.purchase(id), fulfil },
        { ...next },
        (reported) => {
          current.current = reported;
          setState(reported);
        },
      );
    },
    [store, fulfil],
  );

  const retryVerify = useCallback(() => {
    const failed = current.current;
    const last = request.current;
    if (store === null || last === null) return;
    if (failed.status !== 'failed' || failed.stage !== 'verify') return;
    if (failed.transactionId === undefined) return;
    const transactionId = failed.transactionId;
    step({ type: 'retry_verify' });
    void verifyPurchase(
      { platform: store.platform, purchase: (id) => store.purchase(id), fulfil },
      {
        transactionId,
        productId: last.storeProductId,
        ...(last.intentId === undefined ? {} : { intentId: last.intentId }),
      },
      step,
    );
  }, [store, fulfil, step]);

  const reset = useCallback(() => {
    step({ type: 'reset' });
  }, [step]);

  const waiting = state.status === 'pending' || state.status === 'background';
  useEffect(() => {
    if (store === null || !waiting) return undefined;
    return startPurchaseListener(store, fulfil, (transaction, result) => {
      step({ type: 'listener_success', transactionId: transaction.transactionId });
      step({ type: 'verified', result });
    });
  }, [store, fulfil, step, waiting]);

  return { state, buy, retryVerify, reset };
}

export type RestoreState =
  | { readonly status: 'idle' }
  | { readonly status: 'restoring' }
  | { readonly status: 'done'; readonly result: RestoreResult };

/** Restore, inline: what the store account bought is re-checked by the server. */
export function useRestore(store: StorePort | null): {
  readonly state: RestoreState;
  readonly restore: () => void;
} {
  const fulfil = useFulfil();
  const [state, setState] = useState<RestoreState>({ status: 'idle' });
  const busy = useRef(false);
  const restore = useCallback(() => {
    if (store === null || busy.current) return;
    busy.current = true;
    setState({ status: 'restoring' });
    restorePurchases(store, fulfil)
      .then(
        (result) => setState({ status: 'done', result }),
        () => setState({ status: 'done', result: { kind: 'failed', code: 'NETWORK' } }),
      )
      .finally(() => {
        busy.current = false;
      });
  }, [store, fulfil]);
  return { state, restore };
}
