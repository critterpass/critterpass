/**
 * The api's realtime namespace registry (docs/api-contracts-async.md §1.2). The core namespaces
 * from `RT_CORE_NAMESPACES` register on import; phases that own an object namespace (`poll`,
 * `swipe`, ...) call `registerNamespace()` with their own ACL at startup. The subscribe and publish
 * proxies (routes/internal-rt.ts) deny any channel whose namespace is not registered here.
 */
import {
  CREW_MAP_CHANNEL_ACL_SQL,
  CREW_MAP_CHANNEL_NAMESPACE,
  RT_ACL_RULE_SQL,
  RT_CORE_NAMESPACES,
  type ChannelNamespace,
  type RtAclRule,
  type RtClientPublish,
} from '@cp/domain';
import type pg from 'pg';

/**
 * Decides whether `uid` may subscribe to `<namespace>:<id>`. Runs inside a `withUser(uid)`
 * transaction, so RLS helper functions see `app.uid()` = `uid`.
 */
export type RtAcl = (uid: string, id: string, tx: pg.PoolClient) => Promise<boolean>;

export interface RtNamespaceDefinition {
  readonly name: ChannelNamespace;
  readonly acl: RtAcl;
  /** Presence namespaces get `info` (display name, avatar) attached by the subscribe proxy. */
  readonly presence: boolean;
  readonly clientPublish?: RtClientPublish;
}

/** The ACL for a catalogue rule: its shared SQL predicate, evaluated with the channel id. */
export function aclForRule(rule: RtAclRule): RtAcl {
  return aclForSql(RT_ACL_RULE_SQL[rule]);
}

/** An ACL from one SQL predicate (`$1` = channel id, one row with `allowed`). */
export function aclForSql(sql: string): RtAcl {
  return async (_uid, id, tx) => {
    const { rows } = await tx.query<{ allowed: boolean | null }>(sql, [id]);
    return rows[0]?.allowed === true;
  };
}

const registry = new Map<string, RtNamespaceDefinition>();

export function registerNamespace(definition: RtNamespaceDefinition): void {
  if (registry.has(definition.name)) {
    throw new Error(`realtime namespace ${definition.name} is already registered`);
  }
  registry.set(definition.name, definition);
}

export function getNamespace(name: string): RtNamespaceDefinition | undefined {
  return registry.get(name);
}

export function listNamespaces(): readonly RtNamespaceDefinition[] {
  return [...registry.values()];
}

for (const spec of RT_CORE_NAMESPACES) {
  registerNamespace({
    name: spec.name,
    acl: aclForRule(spec.acl),
    presence: spec.presence,
    ...(spec.clientPublish !== undefined ? { clientPublish: spec.clientPublish } : {}),
  });
}

// Crew live map positions: a participant while the crew map is open (boosted, trip days, before
// last-day midnight); no history, so the app recovers from `GET /v1/trips/{id}/live-snapshot`.
registerNamespace({
  name: CREW_MAP_CHANNEL_NAMESPACE,
  acl: aclForSql(CREW_MAP_CHANNEL_ACL_SQL),
  presence: false,
});

// `poll:{id}`: live tallies for anyone who can read the poll (RLS: its crew, or its trip's crew).
registerNamespace({
  name: 'poll',
  acl: async (_uid, id, tx) => {
    const { rows } = await tx.query<{ allowed: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM polls WHERE id = $1::uuid) AS allowed',
      [id],
    );
    return rows[0]?.allowed === true;
  },
  presence: false,
});
