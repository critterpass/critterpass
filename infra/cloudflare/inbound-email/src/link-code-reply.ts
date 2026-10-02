/**
 * Sending the "Link this email?" reply and telling the api whether it went out. Cloudflare's
 * `message.reply` refuses (throws) unless the incoming mail has a valid DMARC result, the reply goes
 * to the envelope sender and it is the first reply to that message; nothing else reports a failed
 * reply, so the Worker logs the outcome and posts it, signed like the report, to
 * `POST /webhooks/inbound-email/reply`. The api only asks the crew for a code it knows was sent,
 * and clears a code that was not.
 *
 * Logs carry outcomes and verdicts only: never an address, subject, body or code.
 */

/** One structured log line (Workers Logs indexes the JSON fields). */
export type InboundLog = Readonly<Record<string, string | number | boolean | null>>;

export interface LinkCodeReplyDeps {
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly reply: (raw: string) => Promise<void>;
  readonly log: (entry: InboundLog) => void;
}

const EMAIL_LIKE = /[^\s<>"'@,;:]+@[^\s<>"'@,;:]+/gu;

/** Cloudflare's refusal text with anything that looks like an address removed, kept short. */
export function redactError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(EMAIL_LIKE, '[address]').slice(0, 300);
}

/** `dmarc=` from Cloudflare's Authentication-Results header ("none" when absent). */
export function dmarcVerdict(headers: Headers): string {
  const results = (headers.get('authentication-results') ?? '').toLowerCase();
  return /\bdmarc=([a-z]+)/u.exec(results)?.[1] ?? 'none';
}

async function hmacHex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** `timestamp.body` signed with the shared secret: the api's webhook signature check. */
export function signBody(secret: string, timestamp: string, body: string): Promise<string> {
  return hmacHex(secret, `${timestamp}.${body}`);
}

/** POSTs a signed JSON body to the api; resolves to its response, or null when unreachable. */
export async function postSigned(
  deps: Pick<LinkCodeReplyDeps, 'fetch' | 'now'>,
  url: string,
  secret: string,
  body: string,
): Promise<Response | null> {
  const timestamp = String(Math.floor(deps.now().getTime() / 1000));
  try {
    return await deps.fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cp-timestamp': timestamp,
        'x-cp-signature': await signBody(secret, timestamp, body),
      },
      body,
    });
  } catch {
    return null;
  }
}

export type ReplyDelivery = 'sent' | 'failed';

/**
 * Sends the reply, then reports `sent` or `failed` for the api's sender link `linkId` (absent when
 * the api predates delivery reports: the reply is still sent and logged).
 */
export async function deliverLinkCode(
  input: {
    readonly raw: string;
    readonly linkId: string | null;
    readonly dmarc: string;
    readonly apiBaseUrl: string;
    readonly secret: string;
  },
  deps: LinkCodeReplyDeps,
): Promise<ReplyDelivery> {
  let delivery: ReplyDelivery = 'sent';
  let error: string | null = null;
  try {
    await deps.reply(input.raw);
  } catch (caught) {
    delivery = 'failed';
    error = redactError(caught);
  }
  let reported: number | null = null;
  if (input.linkId !== null) {
    const response = await postSigned(
      deps,
      `${input.apiBaseUrl.replace(/\/$/u, '')}/webhooks/inbound-email/reply`,
      input.secret,
      JSON.stringify({ link_id: input.linkId, delivery }),
    );
    reported = response?.status ?? 0;
  }
  deps.log({ event: 'link_code_reply', delivery, dmarc: input.dmarc, error, reported });
  return delivery;
}
