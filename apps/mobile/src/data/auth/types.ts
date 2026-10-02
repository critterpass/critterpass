/**
 * Typed outcomes every auth flow function returns (docs/api-contracts.md §5.1; this phase's
 * this phase's Architecture table ("each returning typed outcomes..."). A discriminated
 * union rather than throwing: the returning-sign-in screen switches on `.kind` exhaustively (never a caught
 * exception) to pick the right undesigned-state copy (docs/undesigned-states.md).
 */

export type AuthProvider = 'apple' | 'google';

/** `POST /link-social`/`/sign-in/social` outcomes (services/api/src/auth/social/). */
export type LinkOutcome =
  | { readonly kind: 'linked' }
  | { readonly kind: 'merge_required'; readonly ticket: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'different_emails_not_allowed' }
  | { readonly kind: 'error'; readonly code: string };

/** `/phone-number/send-otp` outcomes (services/api/src/auth/otp/router.ts). */
export type SendOtpOutcome =
  | { readonly kind: 'sent'; readonly channel: 'whatsapp' | 'sms' }
  | { readonly kind: 'country_unsupported' }
  | { readonly kind: 'rate_limited'; readonly retryAfterS: number }
  | { readonly kind: 'error'; readonly code: string };

/** `/phone-number/verify` outcomes on an anonymous session. */
export type VerifyOtpOutcome =
  | { readonly kind: 'verified' }
  | { readonly kind: 'merge_required'; readonly ticket: string }
  | { readonly kind: 'invalid_code' }
  | { readonly kind: 'expired_code' }
  | { readonly kind: 'too_many_attempts' }
  | { readonly kind: 'error'; readonly code: string };

/** Returning-user sign-in outcomes (services/api/src/routes/auth-extra.ts's `/api/auth/sign-in/phone-number`, or `/sign-in/social`). */
export type ReturningSignInOutcome =
  | { readonly kind: 'signed_in'; readonly userId: string }
  /** Nobody held the number: it is now on the pass this phone is on, which goes on to be made. */
  | { readonly kind: 'linked' }
  | { readonly kind: 'no_account' }
  | { readonly kind: 'invalid_code' }
  | { readonly kind: 'rate_limited'; readonly retryAfterS?: number }
  | { readonly kind: 'error'; readonly code: string };

/** `POST /v1/auth/merge-ticket` preview shape (services/api/src/auth/merge/execute.ts's `MergePreview`). */
export interface MergePreviewSummary {
  readonly crews: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly owner: 'anon' | 'existing';
  }>;
  readonly trips: ReadonlyArray<{ readonly id: string; readonly owner: 'anon' | 'existing' }>;
}

export type MergePreviewOutcome =
  | ({ readonly kind: 'preview' } & MergePreviewSummary)
  | { readonly kind: 'ticket_invalid' }
  | { readonly kind: 'error'; readonly code: string };

export type MergeExecuteOutcome =
  | { readonly kind: 'merged'; readonly userId: string }
  | { readonly kind: 'ticket_invalid' }
  | { readonly kind: 'error'; readonly code: string };
