/**
 * Partner links leave the app through the attribution bridge on this build's own `go.` host
 * (`go.staging.critterpass.app/r/{sub_id}` on staging builds): the click is recorded first with
 * an opaque sub id the app chose, then the bridge redirects to the partner link the api built for
 * it. Offline, the click waits in the queue and the bridge link opens at once.
 */
/* eslint-disable lingui/no-unlocalized-strings -- URL parts, alphabets and error text for developers. */
import {
  bridgeUrl,
  LINK_ENVIRONMENT_CONFIG,
  type AffiliatePartner,
  type LinkEnvironment,
  type LinkTargetPayload,
  type RecordSupplierClickPayload,
} from '@cp/domain';

import type { SendResult } from '@/data/commands/client';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 20 url-safe characters from 20 random bytes (64 symbols, so `& 63` keeps it uniform). */
export function subIdFrom(bytes: Uint8Array): string {
  if (bytes.length < 20) throw new Error('sub id needs 20 random bytes');
  return Array.from(bytes.subarray(0, 20), (byte) => ALPHABET[byte & 63]).join('');
}

/** The bridge link for a click, on this environment's `go.` host (never production by default). */
export function partnerBridgeUrl(subId: string, env: LinkEnvironment): string {
  return bridgeUrl(subId, `https://${LINK_ENVIRONMENT_CONFIG[env].altHost}`);
}

export interface PartnerLinkDeps {
  readonly env: LinkEnvironment;
  readonly randomBytes: (count: number) => Uint8Array;
  readonly sendOnline: (payload: RecordSupplierClickPayload) => Promise<SendResult>;
  readonly sendQueued: (payload: RecordSupplierClickPayload) => Promise<SendResult>;
  readonly openUrl: (url: string) => Promise<void>;
  /** Resolves once a queued op has reached the server, or after a short wait. */
  readonly waitForUpload: (opId: string) => Promise<void>;
}

export interface PartnerLinkRequest {
  readonly partner: AffiliatePartner;
  readonly tripId?: string | undefined;
  readonly target: LinkTargetPayload;
}

/** `unavailable`: the partner isn't set up or is down, so the card hides its link. */
export type PartnerLinkOutcome = 'opened' | 'opened_offline' | 'unavailable' | 'failed';

/** Records the click, then opens the bridge link. Nothing opens when the api rejects the click. */
export async function openPartnerLink(
  deps: PartnerLinkDeps,
  request: PartnerLinkRequest,
): Promise<PartnerLinkOutcome> {
  const subId = subIdFrom(deps.randomBytes(20));
  const payload: RecordSupplierClickPayload = {
    sub_id: subId,
    partner: request.partner,
    target: request.target,
    ...(request.tripId === undefined ? {} : { trip_id: request.tripId }),
  };
  let outcome: PartnerLinkOutcome = 'opened';
  const online = await deps.sendOnline(payload);
  if (online.kind === 'rejected') return 'failed';
  if (online.kind === 'unavailable' && online.code === 'SUPPLIER_UNAVAILABLE') return 'unavailable';
  if (online.kind === 'unavailable') {
    const queued = await deps.sendQueued(payload);
    if (queued.kind === 'rejected') return 'failed';
    // The bridge only redirects once it knows the click: give the queue a moment to upload it.
    await deps.waitForUpload(queued.opId);
    outcome = 'opened_offline';
  }
  await deps.openUrl(partnerBridgeUrl(subId, deps.env));
  return outcome;
}
