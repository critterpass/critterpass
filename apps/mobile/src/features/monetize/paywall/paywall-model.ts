/**
 * What the paywall shows, from the store's offers, the purchase in flight and what the person
 * already has. Pure, so every state is tested without a store: the button only ever buys when the
 * store has a price for the chosen plan, and nothing here grants anything.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, SQL and Intl options, never copy. */
import type { ProductOffer, ProductsState, PurchaseState } from '@/data/billing';

export type BillingPeriod = 'monthly' | 'yearly';

export type PaywallPhase =
  /** The store's prices are on their way. */
  | 'loading'
  /** No store, no products or no price for a plan: nothing can be bought here yet. */
  | 'unavailable'
  | 'offline'
  | 'ready'
  /** The store's own sheet is up. */
  | 'purchasing'
  /** Paid; the server is confirming. */
  | 'verifying'
  /** The store is waiting on someone else (Ask to Buy, a bank check). */
  | 'pending'
  /** Paid, still being confirmed after the wait: it finishes without the person. */
  | 'background'
  /** The store did not take the payment. */
  | 'failed'
  /** Paid, but the server could not confirm it yet. */
  | 'verify_failed'
  | 'subscribed';

export interface PaywallModel {
  readonly phase: PaywallPhase;
  /** The plan the button buys: the chosen one, or the other when the store only has that. */
  readonly period: BillingPeriod;
  readonly offer: ProductOffer | null;
  readonly monthly: ProductOffer | null;
  readonly yearly: ProductOffer | null;
  readonly boost: ProductOffer | null;
  readonly canBuy: boolean;
}

export interface PaywallInput {
  readonly products: ProductsState;
  readonly purchase: PurchaseState;
  readonly period: BillingPeriod;
  readonly passPlus: boolean;
  readonly online: boolean;
}

const BUSY_PHASE: Partial<Record<PurchaseState['status'], PaywallPhase>> = {
  purchasing: 'purchasing',
  verifying: 'verifying',
  pending: 'pending',
  background: 'background',
};

export function paywallModel(input: PaywallInput): PaywallModel {
  const offers = input.products.status === 'ready' ? input.products.offers : {};
  const monthly = offers.pass_monthly ?? null;
  const yearly = offers.pass_yearly ?? null;
  const chosen = input.period === 'yearly' ? yearly : monthly;
  const offer = chosen ?? yearly ?? monthly;
  const period: BillingPeriod =
    offer === null ? input.period : offer === yearly ? 'yearly' : 'monthly';
  const phase = phaseOf(input, offer);
  return {
    phase,
    period,
    offer,
    monthly,
    yearly,
    boost: offers.boost_trip ?? null,
    canBuy: phase === 'ready' || phase === 'failed',
  };
}

function phaseOf(input: PaywallInput, offer: ProductOffer | null): PaywallPhase {
  const { purchase } = input;
  const busy = BUSY_PHASE[purchase.status];
  if (busy !== undefined) return busy;
  if (purchase.status === 'failed' && purchase.stage === 'verify') return 'verify_failed';
  if (input.passPlus || (purchase.status === 'done' && purchase.passPlus)) return 'subscribed';
  if (input.products.status === 'loading') return 'loading';
  if (offer === null) return 'unavailable';
  if (!input.online) return 'offline';
  if (purchase.status === 'failed') return 'failed';
  return 'ready';
}
