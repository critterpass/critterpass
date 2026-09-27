/**
 * Link previews (docs/api-contracts.md §5.6 `GET /v1/links/{token}/preview`) and the "first human
 * open" signal: the first non-bot open of an invite code appends `invite.opened`, once per code.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import { DomainError, type LinkChannel, type LinkPreview, type LinkTarget } from '@cp/domain';
import type pg from 'pg';

import type { LinkProviderRegistry } from './registry';

export interface FirstOpenStore {
  /** node-redis `set(key, value, {NX: true, EX})`; resolves `null` when the key already exists. */
  set(key: string, value: string, options: { NX: true; EX: number }): Promise<string | null>;
}

export interface PreviewDeps {
  readonly pool: pg.Pool;
  readonly registry: LinkProviderRegistry;
  readonly firstOpens: FirstOpenStore;
  readonly now?: () => Date;
}

export interface PreviewRequest {
  readonly target: LinkTarget;
  readonly humanOpen: boolean;
  readonly channel: LinkChannel | null;
}

/** Longer than any code lives (data-model §3.2: codes are purged 30 d after expiry). */
const FIRST_OPEN_TTL_S = 400 * 24 * 3600;

export async function previewLink(
  deps: PreviewDeps,
  request: PreviewRequest,
): Promise<LinkPreview> {
  const provider = deps.registry.get(request.target.kind);
  if (provider === undefined) throw new DomainError('NOT_FOUND');
  const now = (deps.now ?? (() => new Date()))();

  return withSystem(deps.pool, async (tx) => {
    const ctx = { tx, target: request.target, now };
    const preview = await provider.preview(ctx);
    if (preview === null) throw new DomainError('NOT_FOUND');
    if (!request.humanOpen || preview.kind !== 'invite') return preview;

    const resolved = await provider.resolve(ctx);
    if (resolved === null || resolved.joinCodeId === null) return preview;
    const first = await deps.firstOpens.set(`links:opened:${resolved.joinCodeId}`, '1', {
      NX: true,
      EX: FIRST_OPEN_TTL_S,
    });
    if (first !== null) {
      await appendDomainEvent(tx, {
        type: 'invite.opened',
        aggregateKind: 'join_code',
        aggregateId: resolved.joinCodeId,
        actorKind: 'system',
        actorId: null,
        payload: { join_code_id: resolved.joinCodeId, channel: request.channel },
        crewId: resolved.crewId,
      });
    }
    return preview;
  });
}
