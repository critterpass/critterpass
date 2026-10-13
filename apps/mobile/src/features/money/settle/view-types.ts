import type { RevealedPayoutMethod } from '@cp/domain';

export type RevealState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'ok'; readonly methods: readonly RevealedPayoutMethod[] };
