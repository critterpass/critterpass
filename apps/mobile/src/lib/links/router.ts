/**
 * The deep-link router: every incoming URL (Universal Link, App Link, `critterpass://` from a
 * notification or widget, a claimed deferred link) becomes one in-app href.
 *
 * Gating, in order: a URL that is not ours passes through untouched; a malformed link of ours goes
 * Home with a notice; before onboarding the link waits in the pending slot (invites still open
 * their ticket, which is the start of the invited onboarding); after onboarding the resolver's
 * state and the local membership check pick the screen (route-map.ts). Resolving is bounded, so
 * an offline or slow api only drops the state hint, never the navigation.
 */
import { linkPath, parseLink, parseLinkPath, parseSchemeUrl, type LinkTarget } from '@cp/domain';

import {
  isOnboardingComplete,
  savePendingLink,
  takePendingLink,
  type PendingLink,
} from './pending';
import type { LinkResolverClient, PreviewResult } from './resolver-client';
import { homeWithNotice, routeBeforeOnboarding, routeForTarget, type LinkFacts } from './route-map';

export interface LinkRouterDeps {
  /** Null until the signed-in data layer is ready; links still route, without a state check. */
  readonly resolver: Pick<LinkResolverClient, 'preview'> | null;
  /** Local (synced) membership check for a crew. */
  readonly isMember: (crewId: string) => boolean;
  /**
   * The crew a code belongs to when it is one of the user's own crews' codes. Members sync their
   * crews' `join_codes`, so a local hit means "already a member"; null otherwise.
   */
  readonly memberCrewForCode: (code: string) => string | null;
  readonly resolveTimeoutMs: number;
  readonly now: () => number;
}

const DEFAULT_DEPS: LinkRouterDeps = {
  resolver: null,
  isMember: () => false,
  memberCrewForCode: () => null,
  resolveTimeoutMs: 2000,
  now: () => Date.now(),
};

let deps: LinkRouterDeps = DEFAULT_DEPS;

/** Wired once at start-up by the data layer; `+native-intent` runs outside React and reads this. */
export function configureLinkRouter(next: Partial<LinkRouterDeps>): void {
  deps = { ...deps, ...next };
}

export function resetLinkRouterForTests(): void {
  deps = DEFAULT_DEPS;
}

const OUR_URL =
  /^(?:https:\/\/(?:go\.)?(?:staging\.)?critterpass\.app\/|critterpass(?:-staging|-dev)?:)/i;

/** A link target from any URL form the app receives, or null when it is not a link of ours. */
export function parseIncomingLink(url: string): LinkTarget | null {
  return parseLink(url)?.target ?? parseSchemeUrl(url);
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

async function previewOf(target: LinkTarget): Promise<PreviewResult> {
  if (deps.resolver === null) return { status: 'unavailable' };
  return withTimeout(deps.resolver.preview(target), deps.resolveTimeoutMs, {
    status: 'unavailable',
  });
}

function factsFrom(
  target: LinkTarget,
  preview: PreviewResult,
  via?: PendingLink['via'],
): LinkFacts {
  const found = preview.status === 'found' ? preview.preview : null;
  return {
    kind: found?.kind ?? target.kind,
    state: found?.state ?? null,
    crewId: null,
    isMember: false,
    ...(via !== undefined ? { via } : {}),
  };
}

/** Routes an already-parsed target (also used for claimed deferred links). */
export async function routeTarget(
  target: LinkTarget,
  options: { readonly via?: PendingLink['via']; readonly crewId?: string | null } = {},
): Promise<string> {
  const preview = await previewOf(target);
  if (preview.status === 'not_found') return homeWithNotice('link_unknown');
  const facts = factsFrom(target, preview, options.via);
  if (!isOnboardingComplete()) {
    savePendingLink({
      link: linkPath(target),
      capturedAt: deps.now(),
      ...(options.via !== undefined ? { via: options.via } : {}),
    });
    return routeBeforeOnboarding(target, facts);
  }
  const memberCrew =
    target.kind === 'invite' || target.kind === 'referral'
      ? deps.memberCrewForCode(target.code)
      : null;
  const crewId = memberCrew ?? options.crewId ?? null;
  return routeForTarget(target, {
    ...facts,
    crewId,
    isMember: memberCrew !== null || (crewId !== null && deps.isMember(crewId)),
  });
}

/** `+native-intent`'s rewrite: an incoming system URL to the in-app href to open. */
export async function routeIncomingUrl(url: string): Promise<string> {
  const target = parseIncomingLink(url);
  if (target !== null) return routeTarget(target);
  return OUR_URL.test(url) ? homeWithNotice('link_unknown') : url;
}

/** Called by onboarding once the pass is issued: the href of the link that was waiting, if any. */
export async function resumePendingLink(): Promise<string | null> {
  const pending = takePendingLink(deps.now());
  if (pending === null) return null;
  const target = parseLinkPath(pending.link);
  if (target === null) return null;
  return routeTarget(target, pending.via !== undefined ? { via: pending.via } : {});
}
