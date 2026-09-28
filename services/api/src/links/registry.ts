/**
 * Link target providers (docs/api-contracts.md §5.6): the resolver dispatches a parsed link to the
 * provider registered for its kind. This service registers the join-code provider (./join-code-
 * provider.ts) for invite and referral codes; consumer areas register their own (shared plans,
 * guides, locals) and the phone matcher for pending seat invites.
 */
import type { LinkKind, LinkPreview, LinkState, LinkTarget } from '@cp/domain';
import type pg from 'pg';

export interface LinkProviderContext {
  /** An `app_system` transaction: providers read across crews to describe a link to a stranger. */
  readonly tx: pg.PoolClient;
  readonly target: LinkTarget;
  readonly now: Date;
}

export interface ResolvedLink {
  /** Effective kind: an `/i/` code can turn out to be a referral code. */
  readonly kind: LinkKind;
  readonly state: LinkState;
  readonly crewId: string | null;
  readonly joinCodeId: string | null;
  readonly joinCode: string | null;
  readonly inviteId: string | null;
}

export interface LinkProvider {
  readonly kinds: readonly LinkKind[];
  /** Public-safe preview; null when the target does not exist (the caller answers a uniform 404). */
  preview(ctx: LinkProviderContext): Promise<LinkPreview | null>;
  /** Server-side facts the claim and the app router need; null when the target does not exist. */
  resolve(ctx: LinkProviderContext): Promise<ResolvedLink | null>;
  /** Records one bot-filtered human open (per-invite open counts for the inviter). */
  recordOpen?(ctx: LinkProviderContext): Promise<void>;
}

/**
 * Finds a pending seat invite addressed to a verified phone (matched on the peppered phone hash,
 * never the number). Registered by the invites area; absent means no phone match can exist yet.
 */
export type PhoneInviteMatcher = (
  tx: pg.PoolClient,
  input: { readonly uid: string; readonly phoneHash: string },
) => Promise<{ readonly target: LinkTarget; readonly resolved: ResolvedLink } | null>;

export interface LinkProviderRegistry {
  register(provider: LinkProvider): void;
  get(kind: LinkKind): LinkProvider | undefined;
  setPhoneMatcher(matcher: PhoneInviteMatcher): void;
  phoneMatcher(): PhoneInviteMatcher | undefined;
}

export function createLinkProviderRegistry(): LinkProviderRegistry {
  const byKind = new Map<LinkKind, LinkProvider>();
  let matcher: PhoneInviteMatcher | undefined;
  return {
    register(provider) {
      for (const kind of provider.kinds) {
        if (byKind.has(kind)) throw new Error(`a link provider is already registered for ${kind}`);
      }
      for (const kind of provider.kinds) byKind.set(kind, provider);
    },
    get: (kind) => byKind.get(kind),
    setPhoneMatcher(next) {
      if (matcher !== undefined) throw new Error('a phone invite matcher is already registered');
      matcher = next;
    },
    phoneMatcher: () => matcher,
  };
}

/**
 * Kinds nobody registered a provider for (plain in-app routes, member plan links) still resolve:
 * the app decides access once the user is signed in, so the server only vouches for the grammar.
 */
export function openResolution(target: LinkTarget): ResolvedLink {
  return {
    kind: target.kind,
    state: 'active',
    crewId: null,
    joinCodeId: null,
    joinCode: null,
    inviteId: null,
  };
}
