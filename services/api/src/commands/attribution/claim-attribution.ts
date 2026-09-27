/**
 * `claim_attribution` (docs/api-contracts.md §4.1, §5.6 `POST /v1/links/claim`): a freshly
 * installed app hands back the link that brought it (Play referrer, pasted link, typed code, the
 * link it was first opened with) or asks for a phone match, and gets the validated link to route
 * to. One attribution per device: a second claim from the same device returns the first claim's
 * link, and a replayed op returns its stored outcome. Internal (system door only) because
 * `install_attributions` is system-only; `POST /v1/links/claim` runs it for the session's uid.
 */
import { appendDomainEvent } from '@cp/db';
import {
  claimAttributionPayloadSchema,
  DomainError,
  linkPath,
  parseLinkPath,
  type ClaimAttributionResult,
  type LinkTarget,
} from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';
import type { LinkProviderRegistry, ResolvedLink } from '../../links/registry';
import {
  assertSeatToken,
  readClaimSource,
  resolveTarget,
  type ClaimSource,
  type LinkResolverConfig,
} from '../../links/resolver';

export const CLAIM_ATTRIBUTION = 'claim_attribution';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ClaimAttributionDeps {
  readonly registry: LinkProviderRegistry;
  readonly config: LinkResolverConfig;
}

interface StoredClaim {
  readonly via: ClaimAttributionResult['via'];
  readonly claimed_url: string | null;
}

function result(
  source: Pick<ClaimSource, 'via'>,
  target: LinkTarget | null,
  resolved: ResolvedLink | null,
  replayed: boolean,
): ClaimAttributionResult {
  return {
    matched: resolved !== null,
    via: source.via,
    kind: resolved?.kind ?? null,
    state: resolved?.state ?? null,
    link: target === null ? null : linkPath(target),
    crew_id: resolved?.crewId ?? null,
    replayed,
  };
}

async function existingClaim(tx: pg.PoolClient, deviceId: string): Promise<StoredClaim | null> {
  const { rows } = await tx.query<StoredClaim>(
    `SELECT via, claimed_url FROM install_attributions
      WHERE device_id = $1 AND claimed_at IS NOT NULL`,
    [deviceId],
  );
  return rows[0] ?? null;
}

async function phoneMatch(
  tx: pg.PoolClient,
  deps: ClaimAttributionDeps,
  uid: string,
): Promise<{ target: LinkTarget; resolved: ResolvedLink } | null> {
  const { rows } = await tx.query<{ phone_hash: string | null }>(
    'SELECT phone_hash FROM user_private WHERE user_id = $1',
    [uid],
  );
  const phoneHash = rows[0]?.phone_hash ?? null;
  if (phoneHash === null) throw new DomainError('STATE_INVALID', { reason: 'phone_unverified' });
  const matcher = deps.registry.phoneMatcher();
  return matcher === undefined ? null : matcher(tx, { uid, phoneHash });
}

export function createClaimAttributionCommand(deps: ClaimAttributionDeps) {
  return defineCommand({
    name: CLAIM_ATTRIBUTION,
    v: 1,
    schema: claimAttributionPayloadSchema,
    offline: false,
    allowAnonymous: true,
    internal: true,
    authorize: (_tx, _payload, ctx) =>
      UUID.test(ctx.device.id)
        ? Promise.resolve()
        : Promise.reject(new DomainError('VALIDATION', { reason: 'device_id_not_uuid' })),
    handle: async (tx, payload, ctx): Promise<ClaimAttributionResult> => {
      const now = ctx.clock.serverNow;
      const deviceId = ctx.device.id;

      const previous = await existingClaim(tx, deviceId);
      if (previous !== null) {
        const target = previous.claimed_url === null ? null : parseLinkPath(previous.claimed_url);
        const resolved =
          target === null ? null : await resolveTarget(tx, deps.registry, target, now);
        return result(previous, target, resolved, true);
      }

      let source: Pick<ClaimSource, 'via' | 'channel'>;
      let target: LinkTarget;
      let resolved: ResolvedLink | null;
      const linkSource = readClaimSource(payload, deps.config);
      if (linkSource === null) {
        const match = await phoneMatch(tx, deps, ctx.uid);
        if (match === null) return result({ via: 'phone' }, null, null, false);
        ({ target, resolved } = match);
        source = { via: 'phone', channel: null };
      } else {
        await assertSeatToken(linkSource.target, deps.config);
        target = linkSource.target;
        resolved = await resolveTarget(tx, deps.registry, target, now);
        // Uniform with an unknown link: nothing reveals whether a code ever existed.
        if (resolved === null) throw new DomainError('CODE_INVALID', { reason: 'unknown' });
        source = linkSource;
      }

      await tx.query(
        `INSERT INTO install_attributions
           (device_id, channel, source, invite_id, join_code, via, claimed_url, link_kind, claimed_at)
         VALUES ($1, $2, 'link', $3, $4, $5, $6, $7, $8)
         ON CONFLICT (device_id) DO UPDATE SET
           channel = EXCLUDED.channel, source = EXCLUDED.source, invite_id = EXCLUDED.invite_id,
           join_code = EXCLUDED.join_code, via = EXCLUDED.via, claimed_url = EXCLUDED.claimed_url,
           link_kind = EXCLUDED.link_kind, claimed_at = EXCLUDED.claimed_at
         WHERE install_attributions.claimed_at IS NULL`,
        [
          deviceId,
          source.channel,
          resolved.inviteId,
          resolved.joinCode,
          source.via,
          linkPath(target),
          resolved.kind,
          now,
        ],
      );
      await appendDomainEvent(tx, {
        type: 'attribution.claimed',
        aggregateKind: 'device',
        aggregateId: deviceId,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { device_id: deviceId, via: source.via, link_kind: resolved.kind },
        crewId: resolved.crewId,
      });
      return result(source, target, resolved, false);
    },
  });
}
