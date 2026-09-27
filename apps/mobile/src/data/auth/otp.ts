/**
 * Phone OTP on an anonymous session (docs/api-contracts.md §5.1 `POST /phone-number/send-otp`,
 * `POST /phone-number/verify`; 3a-8 "Phone sign-in"). Same `@better-fetch/fetch` error-shape split as
 * ./link.ts: Better Auth's own OTP errors (`INVALID_OTP`, `OTP_EXPIRED`, `TOO_MANY_ATTEMPTS`) arrive
 * flat; `MERGE_REQUIRED` (a phone number already owned by another uid) arrives wrapped in this app's
 * own envelope (services/api/src/auth/merge/intercept.ts).
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is an error code or outcome discriminant, never rendered copy. */
import type { SendOtpOutcome, VerifyOtpOutcome } from './types';

interface WireErrorShape {
  readonly status?: number;
  readonly code?: string;
  readonly retryAfterS?: number;
  readonly detail?: { readonly retry_after_s?: number; readonly reason?: string };
  readonly error?: {
    readonly code?: string;
    readonly retryable?: boolean;
    readonly detail?: {
      readonly ticket?: string;
      readonly retry_after_s?: number;
      readonly reason?: string;
    };
  };
}

export interface SendOtpClient {
  sendOtp(args: { phoneNumber: string }): Promise<{ data: unknown; error: WireErrorShape | null }>;
}

export interface VerifyOtpClient {
  verify(args: {
    phoneNumber: string;
    code: string;
    updatePhoneNumber: true;
  }): Promise<{ data: unknown; error: WireErrorShape | null }>;
}

export async function sendOtp(phoneNumber: string, client: SendOtpClient): Promise<SendOtpOutcome> {
  const { error } = await client.sendOtp({ phoneNumber });
  if (!error) return { kind: 'sent', channel: 'whatsapp' };
  if (
    error.detail?.reason === 'country_unsupported' ||
    error.error?.detail?.reason === 'country_unsupported'
  ) {
    return { kind: 'country_unsupported' };
  }
  if (error.status === 429) {
    const retryAfterS = error.detail?.retry_after_s ?? error.error?.detail?.retry_after_s ?? 0;
    return { kind: 'rate_limited', retryAfterS };
  }
  return { kind: 'error', code: error.code ?? error.error?.code ?? 'UNKNOWN' };
}

export async function verifyOtp(
  input: { phoneNumber: string; code: string },
  client: VerifyOtpClient,
): Promise<VerifyOtpOutcome> {
  const { error } = await client.verify({
    phoneNumber: input.phoneNumber,
    code: input.code,
    updatePhoneNumber: true,
  });
  if (!error) return { kind: 'verified' };

  const wrappedTicket =
    error.error?.code === 'MERGE_REQUIRED' ? error.error.detail?.ticket : undefined;
  if (wrappedTicket) return { kind: 'merge_required', ticket: wrappedTicket };

  if (error.code === 'INVALID_OTP') return { kind: 'invalid_code' };
  if (error.code === 'OTP_EXPIRED') return { kind: 'expired_code' };
  if (error.code === 'TOO_MANY_ATTEMPTS') return { kind: 'too_many_attempts' };
  return { kind: 'error', code: error.code ?? error.error?.code ?? 'UNKNOWN' };
}
