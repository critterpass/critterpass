/**
 * First-launch deferred link resolution: the install brought a link, the app opens on it without
 * anyone typing. Order: Android Play Install Referrer (deterministic) → iOS probable-link check
 * (no pasteboard read, no alert) which only *offers* the system paste control → nothing, and the
 * normal splash with its "I have a code" entry. Whatever is claimed goes through
 * `POST /v1/links/claim`, then the router (which holds it until onboarding issues the pass).
 * Runs once per install; bounded so the splash never waits more than `timeoutMs`.
 */
import { createMMKV } from 'react-native-mmkv';

import {
  normalizeJoinCode,
  parseLink,
  parseLinkPath,
  type AttributionVia,
  type ClaimAttributionPayload,
  type ClaimAttributionResult,
} from '@cp/domain';

import type { ClaimDevice, LinkResolverClient } from './resolver-client';
import { codeEntryRoute } from './route-map';
import { routeTarget } from './router';

const storage = createMMKV({ id: 'cp-links' });
const CHECKED_KEY = 'cp.links.deferred_checked';

/** The web store button puts the link path in the Play referrer under this key. */
export const INSTALL_REFERRER_LINK_PARAM = 'cp_link';
export const DEFERRED_RESOLVE_TIMEOUT_MS = 2000;

export interface DeferredPrimitives {
  readonly platform: 'ios' | 'android';
  /** Android: the install referrer, first call only (cp-deferred-link). */
  getInstallReferrer(): Promise<string | null>;
  /** iOS: whether the pasteboard probably holds a link, without reading it. */
  detectLikelyLink(): Promise<boolean>;
  /** Internal builds only: a referrer injected by a test run instead of the Play one. */
  getReferrerOverride?(): Promise<string | null>;
}

export type LinkFunnelEvent =
  | {
      readonly name: 'deferred_link_checked';
      readonly outcome: DeferredOutcome['kind'];
      readonly ms: number;
    }
  | { readonly name: 'install_attributed'; readonly via: AttributionVia };

export interface DeferredDeps {
  readonly primitives: DeferredPrimitives;
  readonly client: Pick<LinkResolverClient, 'claim'>;
  readonly device: ClaimDevice;
  readonly track?: (event: LinkFunnelEvent) => void;
  readonly timeoutMs?: number;
  readonly now?: () => number;
}

export type DeferredOutcome =
  /** Navigate to `href`; the link is also pending until onboarding completes. */
  | { readonly kind: 'claimed'; readonly href: string; readonly result: ClaimAttributionResult }
  /** iOS: show 3a-11's paste control ("Paste a link"). */
  | { readonly kind: 'offer_paste' }
  /** The pasted link or typed code was refused: 3a-11 with the shake toast. */
  | { readonly kind: 'invalid'; readonly href: string }
  /** Nothing to resume (or offline / too slow): the normal splash. */
  | { readonly kind: 'none' };

export function hasCheckedDeferredLink(): boolean {
  return storage.getBoolean(CHECKED_KEY) === true;
}

export function resetDeferredLinkCheckForTests(): void {
  storage.remove(CHECKED_KEY);
}

function referrerCarriesLink(referrer: string | null): referrer is string {
  return referrer !== null && new URLSearchParams(referrer).has(INSTALL_REFERRER_LINK_PARAM);
}

async function claimThenRoute(
  payload: ClaimAttributionPayload,
  via: AttributionVia,
  deps: DeferredDeps,
): Promise<DeferredOutcome> {
  const claim = await deps.client.claim(payload, deps.device);
  if (claim.status === 'unavailable') return followOffline(payload, via);
  if (claim.status === 'rejected' || !claim.result.matched || claim.result.link === null) {
    return via === 'referrer'
      ? { kind: 'none' }
      : { kind: 'invalid', href: codeEntryRoute({ notice: 'invalid' }) };
  }
  const target = parseLinkPath(claim.result.link);
  if (target === null) return { kind: 'none' };
  deps.track?.({ name: 'install_attributed', via: claim.result.via });
  const href = await routeTarget(target, { via: claim.result.via, crewId: claim.result.crew_id });
  return { kind: 'claimed', href, result: claim.result };
}

/**
 * Offline or throttled: the referrer and a pasted link still carry their own path, so the person
 * lands on it anyway (the server re-validates when the target screen loads); attribution is lost.
 */
async function followOffline(
  payload: ClaimAttributionPayload,
  via: AttributionVia,
): Promise<DeferredOutcome> {
  const raw =
    payload.install_referrer !== undefined
      ? new URLSearchParams(payload.install_referrer).get(INSTALL_REFERRER_LINK_PARAM)
      : (payload.pasted_url ?? null);
  const target = raw === null ? null : (parseLink(raw)?.target ?? null);
  if (target === null) return { kind: 'none' };
  const href = await routeTarget(target, { via });
  return {
    kind: 'claimed',
    href,
    result: {
      matched: true,
      via,
      kind: target.kind,
      state: null,
      link: raw,
      crew_id: null,
      replayed: false,
    },
  };
}

function bounded(work: Promise<DeferredOutcome>, ms: number): Promise<DeferredOutcome> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ kind: 'none' }), ms);
    void work.then(
      (outcome) => {
        clearTimeout(timer);
        resolve(outcome);
      },
      () => {
        clearTimeout(timer);
        resolve({ kind: 'none' });
      },
    );
  });
}

async function firstLaunchWork(deps: DeferredDeps): Promise<DeferredOutcome> {
  const { primitives } = deps;
  if (primitives.platform === 'android') {
    const override = (await primitives.getReferrerOverride?.()) ?? null;
    const referrer = override ?? (await primitives.getInstallReferrer());
    return referrerCarriesLink(referrer)
      ? claimThenRoute({ install_referrer: referrer }, 'referrer', deps)
      : { kind: 'none' };
  }
  return (await primitives.detectLikelyLink()) ? { kind: 'offer_paste' } : { kind: 'none' };
}

/** Once per install, at the splash. Later launches resolve `none` immediately. */
export async function resolveOnFirstLaunch(deps: DeferredDeps): Promise<DeferredOutcome> {
  if (hasCheckedDeferredLink()) return { kind: 'none' };
  storage.set(CHECKED_KEY, true);
  const now = deps.now ?? (() => Date.now());
  const started = now();
  const outcome = await bounded(
    firstLaunchWork(deps),
    deps.timeoutMs ?? DEFERRED_RESOLVE_TIMEOUT_MS,
  );
  deps.track?.({ name: 'deferred_link_checked', outcome: outcome.kind, ms: now() - started });
  return outcome;
}

/** The link the person pasted through the system paste control (never read silently). */
export function claimPastedLink(pasted: string, deps: DeferredDeps): Promise<DeferredOutcome> {
  return claimThenRoute({ pasted_url: pasted.trim() }, 'paste', deps);
}

/** A typed six-character code (3a-11); malformed input never leaves the device. */
export async function claimTypedCode(code: string, deps: DeferredDeps): Promise<DeferredOutcome> {
  const normalized = normalizeJoinCode(code);
  if (normalized === null) return { kind: 'invalid', href: codeEntryRoute({ notice: 'invalid' }) };
  return claimThenRoute({ join_code: normalized }, 'code', deps);
}
