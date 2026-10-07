/**
 * Transactional e-mail from the worker: one plain-text message to one address, behind an
 * interface so the provider is swapped at the edge. The provider is Resend (`RESEND_API_KEY`),
 * sending from `EMAIL_FROM` (an address on a domain verified there). Plain text only: no HTML, no
 * open or click tracking. The idempotency key makes a repeated request for the same message a
 * no-op at the provider.
 */
const RESEND_API_URL = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 15_000;

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** The same key for the same message, however often it is asked for. */
  readonly idempotencyKey: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export class EmailSendError extends Error {
  constructor(readonly status: number) {
    super(`e-mail provider answered ${status}`);
    this.name = 'EmailSendError';
  }
}

export interface ResendOptions {
  readonly apiKey: string;
  /** `CritterPass <hello@example.com>` or a bare address. */
  readonly from: string;
  /** Network boundary override (recorded fixtures in tests). */
  readonly fetch?: typeof fetch;
}

export function createResendSender(options: ResendOptions): EmailSender {
  const send = options.fetch ?? fetch;
  return {
    async send(message) {
      const response = await send(RESEND_API_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': message.idempotencyKey,
        },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new EmailSendError(response.status);
    },
  };
}

export interface EmailSenderEnv {
  readonly RESEND_API_KEY?: string | undefined;
  readonly EMAIL_FROM?: string | undefined;
}

/** The sender the environment names; `null` (e-mail not configured) unless both values are set. */
export function emailSenderFromEnv(
  env: EmailSenderEnv,
  fetchImpl?: typeof fetch,
): EmailSender | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (apiKey === undefined || apiKey === '' || from === undefined || from === '') return null;
  return createResendSender({
    apiKey,
    from,
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });
}
