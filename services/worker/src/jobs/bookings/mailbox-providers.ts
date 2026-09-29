/**
 * The mailbox providers' network boundary for scans: refreshing an access token, listing what is
 * new since the stored cursor (Gmail history, Graph delta), reading a message's headers alone and,
 * only for a message the trip filter picked, its raw MIME. Tokens are never logged.
 */
import { crypto as dbCrypto } from '@cp/db';
import { MAILBOX_PROVIDERS_SPEC, type MailboxProvider, type MessageHeaders } from '@cp/domain';
import { z } from 'zod';

type FieldKeyring = Parameters<typeof dbCrypto.encryptField>[1];

export interface ProviderDeps {
  readonly keyring: FieldKeyring | undefined;
  readonly clients: Partial<Record<MailboxProvider, { clientId: string; clientSecret: string }>>;
  /** The provider network boundary. */
  readonly fetch: typeof fetch;
}

export interface Connection {
  readonly id: string;
  readonly user_id: string;
  readonly provider: MailboxProvider;
  readonly refresh_token_enc: string | null;
  readonly last_history_id: string | null;
}

/** Most messages looked at per scan (headers), and opened per scan. */
export const MAX_HEADERS = 200;
export const MAX_OPENED = 25;

export class GrantRevoked extends Error {}

export interface MailboxApi {
  /** Ids of messages new since the cursor, and the next cursor. */
  list(cursor: string | null): Promise<{ ids: string[]; cursor: string | null }>;
  headers(id: string): Promise<MessageHeaders | null>;
  raw(id: string): Promise<Uint8Array | null>;
}

async function getJson(
  deps: ProviderDeps,
  url: string,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const response = await deps.fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

export async function accessToken(
  deps: ProviderDeps,
  connection: Connection,
): Promise<{ token: string; refreshed: string | null }> {
  const client = deps.clients[connection.provider];
  if (client === undefined || deps.keyring === undefined || connection.refresh_token_enc === null) {
    throw new GrantRevoked('no credentials');
  }
  const refresh = dbCrypto.decryptField(connection.refresh_token_enc, deps.keyring);
  const response = await deps.fetch(MAILBOX_PROVIDERS_SPEC[connection.provider].tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      ...(connection.provider === 'microsoft'
        ? { scope: MAILBOX_PROVIDERS_SPEC.microsoft.scopes.join(' ') }
        : {}),
    }).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 400 || response.status === 401) throw new GrantRevoked('refresh refused');
  const body = z
    .object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional() })
    .parse(await response.json());
  return { token: body.access_token, refreshed: body.refresh_token ?? null };
}

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function gmailApi(deps: ProviderDeps, token: string): MailboxApi {
  return {
    async list(cursor) {
      if (cursor !== null) {
        const history = await getJson(
          deps,
          `${GMAIL}/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded&maxResults=${MAX_HEADERS}`,
          token,
        );
        if (history.status === 200) {
          const parsed = z
            .object({
              historyId: z.string(),
              history: z
                .array(
                  z.object({
                    messagesAdded: z
                      .array(z.object({ message: z.object({ id: z.string() }) }))
                      .optional(),
                  }),
                )
                .optional(),
            })
            .parse(history.body);
          const ids = (parsed.history ?? []).flatMap((entry) =>
            (entry.messagesAdded ?? []).map((m) => m.message.id),
          );
          return { ids: [...new Set(ids)], cursor: parsed.historyId };
        }
        if (history.status !== 404) throw new Error(`gmail history ${history.status}`);
      }
      const profile = z
        .object({ historyId: z.string() })
        .parse((await getJson(deps, `${GMAIL}/profile`, token)).body);
      const listed = z
        .object({ messages: z.array(z.object({ id: z.string() })).optional() })
        .parse(
          (
            await getJson(
              deps,
              `${GMAIL}/messages?q=${encodeURIComponent('newer_than:180d')}&maxResults=${MAX_HEADERS}`,
              token,
            )
          ).body,
        );
      return { ids: (listed.messages ?? []).map((m) => m.id), cursor: profile.historyId };
    },
    async headers(id) {
      const result = await getJson(
        deps,
        `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        token,
      );
      const parsed = z
        .object({
          internalDate: z.string(),
          payload: z.object({
            headers: z.array(z.object({ name: z.string(), value: z.string() })),
          }),
        })
        .safeParse(result.body);
      if (!parsed.success) return null;
      const header = (name: string) =>
        parsed.data.payload.headers.find((h) => h.name.toLowerCase() === name)?.value ?? '';
      const from = /<([^<>]+)>/u.exec(header('from'))?.[1] ?? header('from');
      return {
        from: from.trim().toLowerCase(),
        subject: header('subject'),
        date: new Date(Number(parsed.data.internalDate)),
      };
    },
    async raw(id) {
      const result = await getJson(deps, `${GMAIL}/messages/${id}?format=raw`, token);
      const parsed = z.object({ raw: z.string() }).safeParse(result.body);
      return parsed.success ? new Uint8Array(Buffer.from(parsed.data.raw, 'base64url')) : null;
    },
  };
}

const GRAPH = 'https://graph.microsoft.com/v1.0/me';
const graphMessage = z.object({
  id: z.string(),
  subject: z.string().nullable().optional(),
  receivedDateTime: z.string().optional(),
  from: z
    .object({ emailAddress: z.object({ address: z.string() }) })
    .nullable()
    .optional(),
  '@removed': z.unknown().optional(),
});

export function graphApi(deps: ProviderDeps, token: string): MailboxApi {
  const seen = new Map<string, MessageHeaders>();
  return {
    async list(cursor) {
      let url: string | null =
        cursor ?? `${GRAPH}/mailFolders/inbox/messages/delta?$select=from,subject,receivedDateTime`;
      const ids: string[] = [];
      let next: string | null = cursor;
      while (url !== null && ids.length < MAX_HEADERS) {
        const page = z
          .object({
            value: z.array(graphMessage),
            '@odata.nextLink': z.string().optional(),
            '@odata.deltaLink': z.string().optional(),
          })
          .parse((await getJson(deps, url, token)).body);
        for (const message of page.value) {
          if (message['@removed'] !== undefined) continue;
          ids.push(message.id);
          seen.set(message.id, {
            from: (message.from?.emailAddress.address ?? '').toLowerCase(),
            subject: message.subject ?? '',
            date: new Date(message.receivedDateTime ?? 0),
          });
        }
        next = page['@odata.deltaLink'] ?? next;
        url = page['@odata.nextLink'] ?? null;
      }
      return { ids, cursor: next };
    },
    headers: (id) => Promise.resolve(seen.get(id) ?? null),
    async raw(id) {
      const response = await deps.fetch(`${GRAPH}/messages/${id}/$value`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    },
  };
}
