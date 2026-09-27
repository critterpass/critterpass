/**
 * The root's first-launch deferred link check (lib/links/SplashResolveGate.tsx): the native splash
 * stays up while it resolves (at most `DEFERRED_RESOLVE_TIMEOUT_MS`), a claimed link opens its
 * screen, and on iOS a probable link on the pasteboard brings up the system paste control. Renders
 * over the navigator, which stays mounted so `navigate` always has a stack to replace into.
 * `onReady` tells the root the splash may go; it fires once, and never later than
 * `READY_DEADLINE_MS` whatever happens.
 */
import { useEffect, useState } from 'react';

import {
  DEFERRED_RESOLVE_TIMEOUT_MS,
  type DeferredDeps,
  type DeferredPrimitives,
} from '@/lib/links/deferred';
import type { ClaimDevice, LinkResolverClient } from '@/lib/links/resolver-client';
import { SplashResolveGate } from '@/lib/links/SplashResolveGate';

import { PasteLinkOffer } from './PasteLinkOffer';

export const READY_DEADLINE_MS = DEFERRED_RESOLVE_TIMEOUT_MS + 1000;

/** The cp-deferred-link module's calls, as the root route imports them. */
export interface DeferredLinkNative {
  getInstallReferrer(): Promise<string | null>;
  detectLikelyLink(): Promise<boolean>;
  getReferrerOverride(): Promise<string | null>;
  consumeClipLink?(): Promise<string | null>;
}

/** The native primitives for this platform; test referrer overrides never reach production. */
export function deferredLinkPrimitives(
  native: DeferredLinkNative,
  platform: string,
  appVariant: unknown,
): DeferredPrimitives {
  return {
    platform: platform === 'android' ? 'android' : 'ios',
    getInstallReferrer: () => native.getInstallReferrer(),
    detectLikelyLink: () => native.detectLikelyLink(),
    ...(native.consumeClipLink !== undefined
      ? { consumeClipLink: () => native.consumeClipLink?.() ?? Promise.resolve(null) }
      : {}),
    ...(appVariant !== 'production'
      ? { getReferrerOverride: () => native.getReferrerOverride() }
      : {}),
  };
}

/** How the first-launch claim reaches the api, and the device block it carries. */
export interface DeferredLinkClaims {
  readonly client: Pick<LinkResolverClient, 'claim'>;
  readonly device: () => Promise<ClaimDevice>;
}

export interface DeferredLinkGateProps {
  readonly primitives: DeferredPrimitives;
  readonly navigate: (href: string) => void;
  readonly onReady: () => void;
  readonly claims: DeferredLinkClaims;
}

function Settled({ onSettled }: { readonly onSettled: () => void }) {
  useEffect(onSettled, [onSettled]);
  return null;
}

export function DeferredLinkGate({ primitives, navigate, onReady, claims }: DeferredLinkGateProps) {
  const [deps, setDeps] = useState<DeferredDeps | null>(null);
  // Captured once: the check runs with the props the root mounted it with.
  const [mounted] = useState(() => {
    let ready = false;
    return {
      primitives,
      claims,
      markReady: () => {
        if (ready) return;
        ready = true;
        onReady();
      },
    };
  });
  const { markReady } = mounted;

  useEffect(() => {
    const deadline = setTimeout(markReady, READY_DEADLINE_MS);
    mounted.claims
      .device()
      .then(
        (device) =>
          setDeps({ primitives: mounted.primitives, client: mounted.claims.client, device }),
        markReady,
      );
    return () => clearTimeout(deadline);
  }, [mounted, markReady]);

  if (deps === null) return null;
  return (
    <SplashResolveGate
      deps={deps}
      navigate={navigate}
      renderResolving={() => null}
      renderPasteOffer={(controls) => <PasteLinkOffer {...controls} onShown={markReady} />}
    >
      <Settled onSettled={markReady} />
    </SplashResolveGate>
  );
}
