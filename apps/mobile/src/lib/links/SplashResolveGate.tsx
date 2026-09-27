/**
 * Holds the first screen while the deferred link resolves (at most `DEFERRED_RESOLVE_TIMEOUT_MS`),
 * then either navigates to the claimed link, shows the paste offer (iOS, 3a-11 "Paste a link"),
 * or hands over to the normal splash. Headless: the mounting layer renders the resolving state
 * (3a-1 with "Finding your crew…") and the paste offer from design-system components, and passes
 * the native primitives and the signed-in claim client in.
 */
import { useEffect, useState, type ReactNode } from 'react';

import {
  claimPastedLink,
  resolveOnFirstLaunch,
  type DeferredDeps,
  type DeferredOutcome,
} from './deferred';

export interface PasteOfferControls {
  /** Hand the pasted text over (from `ClipboardPasteButton`'s `onPress`). */
  readonly onPasted: (text: string) => void;
  /** "I'll type the code instead" / dismiss. */
  readonly onSkip: () => void;
}

export interface SplashResolveGateProps {
  readonly deps: DeferredDeps;
  /** `router.replace`, for claimed links and the invalid-link code screen. */
  readonly navigate: (href: string) => void;
  readonly renderResolving: () => ReactNode;
  readonly renderPasteOffer: (controls: PasteOfferControls) => ReactNode;
  readonly children: ReactNode;
}

type GateState = 'resolving' | 'paste' | 'done';

export function SplashResolveGate({
  deps,
  navigate,
  renderResolving,
  renderPasteOffer,
  children,
}: SplashResolveGateProps) {
  const [state, setState] = useState<GateState>('resolving');
  // The first-launch check runs once, with the props the gate mounted with.
  const [mounted] = useState(() => ({ deps, navigate }));

  useEffect(() => {
    let active = true;
    const settle = (outcome: DeferredOutcome) => {
      if (!active) return;
      if (outcome.kind === 'offer_paste') {
        setState('paste');
        return;
      }
      setState('done');
      if (outcome.kind === 'claimed' || outcome.kind === 'invalid') {
        mounted.navigate(outcome.href);
      }
    };
    void resolveOnFirstLaunch(mounted.deps).then(settle, () => settle({ kind: 'none' }));
    return () => {
      active = false;
    };
  }, [mounted]);

  if (state === 'resolving') return renderResolving();
  if (state === 'paste') {
    return renderPasteOffer({
      onPasted: (text) => {
        setState('resolving');
        void claimPastedLink(text, deps).then(
          (outcome) => {
            setState('done');
            if (outcome.kind === 'claimed' || outcome.kind === 'invalid') {
              navigate(outcome.href);
            }
          },
          () => setState('done'),
        );
      },
      onSkip: () => setState('done'),
    });
  }
  return children;
}
