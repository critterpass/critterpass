/**
 * Turns whatever a device brings back from a store install (Play referrer, pasted link, typed code,
 * a link it was opened with) into a validated link target, then resolves that target through the
 * provider registry. Host, path and seat-token HMAC are all checked before anything is looked up.
 */
import {
  DomainError,
  linkHostsFor,
  normalizeJoinCode,
  parseLink,
  verifySeatToken,
  type AttributionVia,
  type ClaimAttributionPayload,
  type LinkChannel,
  type LinkEnvironment,
  type LinkTarget,
} from '@cp/domain';

import { openResolution, type LinkProviderRegistry, type ResolvedLink } from './registry';
import type pg from 'pg';

export interface LinkResolverConfig {
  readonly env: LinkEnvironment;
  /** Seat-token HMAC keys by key id; empty means no seat link can be verified (and none accepted). */
  readonly seatKeys: Readonly<Record<string, string>>;
}

export interface ClaimSource {
  readonly via: AttributionVia;
  readonly target: LinkTarget;
  readonly channel: LinkChannel | null;
}

/** Play Install Referrer carries the link path as `cp_link` (the web store button sets it). */
export const INSTALL_REFERRER_LINK_PARAM = 'cp_link';

function invalid(reason: string): DomainError {
  return new DomainError('CODE_INVALID', { reason });
}

function fromUrl(url: string, via: AttributionVia, config: LinkResolverConfig): ClaimSource {
  const parsed = parseLink(url, { hosts: linkHostsFor(config.env) });
  // A bare path is never acceptable from a paste: the host is part of what proves it is ours.
  if (parsed === null || parsed.host === null) throw invalid('link_unrecognised');
  return { via, target: parsed.target, channel: parsed.channel };
}

function fromReferrer(referrer: string): ClaimSource {
  const path = new URLSearchParams(referrer).get(INSTALL_REFERRER_LINK_PARAM);
  if (path === null || !path.startsWith('/')) throw invalid('referrer_without_link');
  const parsed = parseLink(path);
  if (parsed === null) throw invalid('link_unrecognised');
  return { via: 'referrer', target: parsed.target, channel: parsed.channel };
}

/** Reads the one link-bearing source of a claim; phone claims have no link and return null. */
export function readClaimSource(
  payload: ClaimAttributionPayload,
  config: LinkResolverConfig,
): ClaimSource | null {
  if (payload.install_referrer !== undefined) return fromReferrer(payload.install_referrer);
  if (payload.pasted_url !== undefined) return fromUrl(payload.pasted_url, 'paste', config);
  if (payload.opened_url !== undefined) return fromUrl(payload.opened_url, 'link', config);
  if (payload.join_code !== undefined) {
    const code = normalizeJoinCode(payload.join_code);
    if (code === null) throw invalid('code_malformed');
    return { via: 'code', target: { kind: 'invite', code }, channel: null };
  }
  return null;
}

/** Rejects a seat link whose token was not minted for its code with a key we hold. */
export async function assertSeatToken(
  target: LinkTarget,
  config: LinkResolverConfig,
): Promise<void> {
  if (target.kind !== 'invite' || target.seat === undefined) return;
  const check = await verifySeatToken(target.seat, target.code, config.seatKeys);
  if (check.status !== 'ok') throw invalid('seat_unverified');
}

export async function resolveTarget(
  tx: pg.PoolClient,
  registry: LinkProviderRegistry,
  target: LinkTarget,
  now: Date,
): Promise<ResolvedLink | null> {
  const provider = registry.get(target.kind);
  if (provider === undefined) return openResolution(target);
  return provider.resolve({ tx, target, now });
}
