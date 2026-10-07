/**
 * The words for a wire error code. The server answers with a code (`NOT_FOUND`); the traveller
 * never reads one. Every code has a line under its `errors.<code>` key, and a code this build does
 * not know gets the general line, so nothing can render raw.
 */
import { ERROR_CODES, type ErrorCode } from '@cp/domain';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

const MESSAGES: Readonly<Record<ErrorCode, MessageDescriptor>> = {
  AUTH_REQUIRED: msg({ id: 'errors.AUTH_REQUIRED', message: 'Sign in to keep going.' }),
  SESSION_REVOKED: msg({
    id: 'errors.SESSION_REVOKED',
    message: 'You were signed out. Sign in again.',
  }),
  MERGE_REQUIRED: msg({
    id: 'errors.MERGE_REQUIRED',
    message: 'This sign-in belongs to another account. Join the two accounts to carry on.',
  }),
  ACCOUNT_CLOSED: msg({ id: 'errors.ACCOUNT_CLOSED', message: 'This account is closed.' }),
  ATTESTATION_FAILED: msg({
    id: 'errors.ATTESTATION_FAILED',
    message: "We couldn't check this app. Update it and try again.",
  }),
  FORBIDDEN: msg({ id: 'errors.FORBIDDEN', message: "You can't do that here." }),
  ACTION_KEY_SCOPE: msg({
    id: 'errors.ACTION_KEY_SCOPE',
    message: "This link can't do that. Open the app to carry on.",
  }),
  NOT_FOUND: msg({
    id: 'errors.NOT_FOUND',
    message: "We couldn't find that. It may have been removed.",
  }),
  VALIDATION: msg({
    id: 'errors.VALIDATION',
    message: "Something in there isn't right. Check it and try again.",
  }),
  STATE_INVALID: msg({ id: 'errors.STATE_INVALID', message: "That can't be done right now." }),
  VERSION_CONFLICT: msg({
    id: 'errors.VERSION_CONFLICT',
    message: 'Someone changed this first. Take a look and try again.',
  }),
  PLAN_VERSION_CONFLICT: msg({
    id: 'errors.PLAN_VERSION_CONFLICT',
    message: 'The plan changed while you were editing. Take a look and try again.',
  }),
  IDEMPOTENCY_MISMATCH: msg({
    id: 'errors.IDEMPOTENCY_MISMATCH',
    message: "That didn't go through. Try it again.",
  }),
  RATE_LIMITED: msg({
    id: 'errors.RATE_LIMITED',
    message: 'Too many tries. Wait a moment, then try again.',
  }),
  NUDGE_TOO_SOON: msg({
    id: 'errors.NUDGE_TOO_SOON',
    message: 'You nudged them a moment ago. Give them a little time.',
  }),
  QUOTA_EXHAUSTED: msg({
    id: 'errors.QUOTA_EXHAUSTED',
    message: "You've used all of these for now.",
  }),
  REDRAFT_LIMIT: msg({
    id: 'errors.REDRAFT_LIMIT',
    message: "You've used all the redrafts for this trip.",
  }),
  SEAT_LIMIT: msg({ id: 'errors.SEAT_LIMIT', message: 'This crew is full.' }),
  WAITLISTED: msg({
    id: 'errors.WAITLISTED',
    message: "You're on the waitlist. We'll tell you when it's your turn.",
  }),
  ENTITLEMENT_REQUIRED: msg({
    id: 'errors.ENTITLEMENT_REQUIRED',
    message: 'This needs a trip boost.',
  }),
  BOOST_INTENT_LOCKED: msg({
    id: 'errors.BOOST_INTENT_LOCKED',
    message: 'Someone in the crew is already paying for this boost.',
  }),
  VOTE_CLOSED: msg({ id: 'errors.VOTE_CLOSED', message: 'This vote is closed.' }),
  NOT_ELIGIBLE: msg({ id: 'errors.NOT_ELIGIBLE', message: "This isn't available for you yet." }),
  INVITE_EXPIRED: msg({
    id: 'errors.INVITE_EXPIRED',
    message: 'This invite has expired. Ask for a new one.',
  }),
  INVITE_REVOKED: msg({
    id: 'errors.INVITE_REVOKED',
    message: 'This invite was cancelled. Ask for a new one.',
  }),
  SHARE_EXPIRED: msg({ id: 'errors.SHARE_EXPIRED', message: 'This link has expired.' }),
  SHARE_REVOKED: msg({ id: 'errors.SHARE_REVOKED', message: 'This link was turned off.' }),
  CODE_INVALID: msg({
    id: 'errors.CODE_INVALID',
    message: "That code isn't right. Check it and try again.",
  }),
  CODE_REDEEMED: msg({ id: 'errors.CODE_REDEEMED', message: 'That code has already been used.' }),
  CODE_EXPIRED: msg({ id: 'errors.CODE_EXPIRED', message: 'That code has expired.' }),
  OWNED_BY_OTHER_ACCOUNT: msg({
    id: 'errors.OWNED_BY_OTHER_ACCOUNT',
    message: 'This already belongs to another account.',
  }),
  K_ANON_UNAVAILABLE: msg({
    id: 'errors.K_ANON_UNAVAILABLE',
    message: "There isn't enough to show here yet.",
  }),
  HOLD_EXPIRED: msg({
    id: 'errors.HOLD_EXPIRED',
    message: 'The hold ran out. Check the price and try again.',
  }),
  HOLD_NOT_PROVIDED: msg({
    id: 'errors.HOLD_NOT_PROVIDED',
    message: "This one can't be held. Book it to keep it.",
  }),
  SUPPLIER_UNAVAILABLE: msg({
    id: 'errors.SUPPLIER_UNAVAILABLE',
    message: "The booking partner isn't answering. Try again in a moment.",
  }),
  SUPPLIER_REJECTED: msg({
    id: 'errors.SUPPLIER_REJECTED',
    message: 'The booking partner turned this down. Check the details and try again.',
  }),
  PAYMENT_PENDING: msg({
    id: 'errors.PAYMENT_PENDING',
    message: "Your payment is still going through. We'll tell you when it's done.",
  }),
  LOCATION_IMPLAUSIBLE: msg({
    id: 'errors.LOCATION_IMPLAUSIBLE',
    message: "That location doesn't look right. Try again when your signal is better.",
  }),
  CONTENT_REJECTED: msg({
    id: 'errors.CONTENT_REJECTED',
    message: "That can't be posted. Change it and try again.",
  }),
  APPROVAL_REQUIRED: msg({
    id: 'errors.APPROVAL_REQUIRED',
    message: 'This needs an OK from the crew first.',
  }),
  CONSENT_REQUIRED: msg({
    id: 'errors.CONSENT_REQUIRED',
    message: 'We need your OK before doing this.',
  }),
  PAYLOAD_TOO_LARGE: msg({
    id: 'errors.PAYLOAD_TOO_LARGE',
    message: "That's too big to send. Try something smaller.",
  }),
  UPSTREAM_TIMEOUT: msg({
    id: 'errors.UPSTREAM_TIMEOUT',
    message: 'That took too long. Try again.',
  }),
  INTERNAL: msg({ id: 'errors.INTERNAL', message: 'Something went wrong on our side. Try again.' }),
};

const UNKNOWN = msg({ id: 'errors.unknown', message: 'Something went wrong. Try again.' });

const isErrorCode = (code: string): code is ErrorCode =>
  (ERROR_CODES as readonly string[]).includes(code);

/** The message for a wire code, known or not: translate it with `i18n._()` or `t()`. */
export function errorMessage(code: string): MessageDescriptor {
  return isErrorCode(code) ? MESSAGES[code] : UNKNOWN;
}
