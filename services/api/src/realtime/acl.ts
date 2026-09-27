/**
 * Channel authorization for the Centrifugo proxies (docs/api-contracts.md §5.7): parse the channel,
 * find its registered namespace, then run that namespace's ACL as `app_user` with `app.uid` set —
 * the same RLS helper functions every command and Sync Stream relies on.
 */
import { parseRtChannel } from '@cp/domain';
import { withUser } from '@cp/db';
import type pg from 'pg';

import { readPresenceInfo, type RtPresenceInfo } from './info';
import { getNamespace, type RtNamespaceDefinition } from './namespaces';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The proxies carry no device id; `app.device` stays unset for these reads. */
const NO_DEVICE = '';

export type RtChannelDecision =
  | { readonly allowed: false }
  | {
      readonly allowed: true;
      readonly namespace: RtNamespaceDefinition;
      readonly id: string;
      /** Present only for presence namespaces, when requested. */
      readonly info?: RtPresenceInfo;
    };

const DENIED: RtChannelDecision = { allowed: false };

export interface AuthorizeChannelOptions {
  /** Reads presence `info` in the same transaction when the namespace has presence. */
  readonly withPresenceInfo?: boolean;
}

/**
 * Whether `uid` may use `channel`. Unknown namespaces, malformed channels and non-UUID users are
 * denied without touching the database.
 */
export async function authorizeChannel(
  pool: pg.Pool,
  uid: string,
  channel: string,
  options: AuthorizeChannelOptions = {},
): Promise<RtChannelDecision> {
  if (!UUID.test(uid)) return DENIED;
  const parsed = parseRtChannel(channel);
  if (parsed === null) return DENIED;
  const namespace = getNamespace(parsed.namespace);
  if (namespace === undefined) return DENIED;

  return withUser(pool, uid, NO_DEVICE, async (tx) => {
    if (!(await namespace.acl(uid, parsed.id, tx))) return DENIED;
    if (options.withPresenceInfo === true && namespace.presence) {
      return { allowed: true, namespace, id: parsed.id, info: await readPresenceInfo(tx) };
    }
    return { allowed: true, namespace, id: parsed.id };
  });
}
