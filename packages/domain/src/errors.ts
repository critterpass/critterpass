/**
 * Error codes are the wire contract's vocabulary (docs/api-contracts.md §3): every thrown
 * DomainError carries one, and the HTTP status, retryability and i18n key for a code all come from
 * this one table so a code can never disagree with itself across call sites.
 */

export const ERROR_CODES = [
  'AUTH_REQUIRED',
  'SESSION_REVOKED',
  'MERGE_REQUIRED',
  'ACCOUNT_CLOSED',
  'ATTESTATION_FAILED',
  'FORBIDDEN',
  'ACTION_KEY_SCOPE',
  'NOT_FOUND',
  'VALIDATION',
  'STATE_INVALID',
  'VERSION_CONFLICT',
  'PLAN_VERSION_CONFLICT',
  'IDEMPOTENCY_MISMATCH',
  'RATE_LIMITED',
  'NUDGE_TOO_SOON',
  'QUOTA_EXHAUSTED',
  'REDRAFT_LIMIT',
  'SEAT_LIMIT',
  'WAITLISTED',
  'ENTITLEMENT_REQUIRED',
  'BOOST_INTENT_LOCKED',
  'VOTE_CLOSED',
  'NOT_ELIGIBLE',
  'INVITE_EXPIRED',
  'INVITE_REVOKED',
  'SHARE_EXPIRED',
  'SHARE_REVOKED',
  'CODE_INVALID',
  'CODE_REDEEMED',
  'CODE_EXPIRED',
  'OWNED_BY_OTHER_ACCOUNT',
  'K_ANON_UNAVAILABLE',
  'HOLD_EXPIRED',
  'HOLD_NOT_PROVIDED',
  'SUPPLIER_UNAVAILABLE',
  'SUPPLIER_REJECTED',
  'PAYMENT_PENDING',
  'LOCATION_IMPLAUSIBLE',
  'CONTENT_REJECTED',
  'APPROVAL_REQUIRED',
  'CONSENT_REQUIRED',
  'PAYLOAD_TOO_LARGE',
  'UPSTREAM_TIMEOUT',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

interface ErrorCodeDefinition {
  readonly http: number;
  readonly retryable: boolean;
}

const ERROR_TABLE: Record<ErrorCode, ErrorCodeDefinition> = {
  AUTH_REQUIRED: { http: 401, retryable: false },
  SESSION_REVOKED: { http: 401, retryable: false },
  MERGE_REQUIRED: { http: 409, retryable: false },
  ACCOUNT_CLOSED: { http: 403, retryable: false },
  ATTESTATION_FAILED: { http: 403, retryable: false },
  FORBIDDEN: { http: 403, retryable: false },
  ACTION_KEY_SCOPE: { http: 403, retryable: false },
  NOT_FOUND: { http: 404, retryable: false },
  VALIDATION: { http: 422, retryable: false },
  STATE_INVALID: { http: 409, retryable: false },
  VERSION_CONFLICT: { http: 409, retryable: false },
  PLAN_VERSION_CONFLICT: { http: 409, retryable: false },
  IDEMPOTENCY_MISMATCH: { http: 409, retryable: false },
  RATE_LIMITED: { http: 429, retryable: true },
  NUDGE_TOO_SOON: { http: 429, retryable: false },
  QUOTA_EXHAUSTED: { http: 402, retryable: false },
  REDRAFT_LIMIT: { http: 402, retryable: false },
  SEAT_LIMIT: { http: 402, retryable: false },
  WAITLISTED: { http: 200, retryable: false },
  ENTITLEMENT_REQUIRED: { http: 402, retryable: false },
  BOOST_INTENT_LOCKED: { http: 409, retryable: false },
  VOTE_CLOSED: { http: 409, retryable: false },
  NOT_ELIGIBLE: { http: 403, retryable: false },
  INVITE_EXPIRED: { http: 410, retryable: false },
  INVITE_REVOKED: { http: 410, retryable: false },
  SHARE_EXPIRED: { http: 410, retryable: false },
  SHARE_REVOKED: { http: 410, retryable: false },
  CODE_INVALID: { http: 422, retryable: false },
  CODE_REDEEMED: { http: 409, retryable: false },
  CODE_EXPIRED: { http: 410, retryable: false },
  OWNED_BY_OTHER_ACCOUNT: { http: 409, retryable: false },
  K_ANON_UNAVAILABLE: { http: 409, retryable: false },
  HOLD_EXPIRED: { http: 409, retryable: false },
  HOLD_NOT_PROVIDED: { http: 200, retryable: false },
  SUPPLIER_UNAVAILABLE: { http: 503, retryable: true },
  SUPPLIER_REJECTED: { http: 422, retryable: false },
  PAYMENT_PENDING: { http: 202, retryable: false },
  LOCATION_IMPLAUSIBLE: { http: 422, retryable: false },
  CONTENT_REJECTED: { http: 422, retryable: false },
  APPROVAL_REQUIRED: { http: 409, retryable: false },
  CONSENT_REQUIRED: { http: 403, retryable: false },
  PAYLOAD_TOO_LARGE: { http: 413, retryable: false },
  UPSTREAM_TIMEOUT: { http: 504, retryable: true },
  INTERNAL: { http: 500, retryable: true },
};

/** i18n key the client maps to a localized message; UI never shows DomainError#message directly. */
export function errorMessageKey(code: ErrorCode): string {
  return `errors.${code}`;
}

export interface ErrorResponseBody {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly retryable: boolean;
    readonly detail?: unknown;
  };
}

/**
 * The one error type command handlers and domain logic throw (docs/code-standards.md §2: "never
 * throw strings"). `detail` is per-code (docs/api-contracts.md §3) and left as `unknown` here since
 * each code's payload shape is defined where it is thrown.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly http: number;
  readonly retryable: boolean;
  readonly messageKey: string;
  readonly detail: unknown;

  constructor(code: ErrorCode, detail?: unknown, message?: string) {
    super(message ?? code);
    this.name = 'DomainError';
    this.code = code;
    this.http = ERROR_TABLE[code].http;
    this.retryable = ERROR_TABLE[code].retryable;
    this.messageKey = errorMessageKey(code);
    this.detail = detail;
  }

  /** The wire envelope every route returns on failure (docs/api-contracts.md §1: `{error: {...}}`). */
  toResponseBody(): ErrorResponseBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        ...(this.detail !== undefined ? { detail: this.detail } : {}),
      },
    };
  }
}
