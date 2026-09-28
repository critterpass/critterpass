/**
 * The console's server-side module registry: each area (`defineAdminArea`) contributes read routes
 * under `/v1/admin/*` and commands under `/v1/admin/cmd/:name`, and optionally a badge (`count`)
 * and a claimable work queue (`work`). Later areas (jobs, moderation,
 * support, desk, feedback, ...) plug in here without touching the router, mirroring the console's
 * `apps/admin/src/kit/registry.ts`.
 *
 * Example — a read and a command for one area:
 *
 * ```ts
 * export const partnersArea = defineAdminArea({
 *   id: 'partners',
 *   reads: [defineAdminRead({ path: '/partners', area: 'partners', response, run })],
 *   commands: [defineAdminCommand({ name: 'set_partner_adapter', schema, audit, handle })],
 * });
 * ```
 */
import type { AdminArea, AdminRole, AreaCount, AuditChange, CommandContext } from '@cp/domain';
import type pg from 'pg';
import type { z } from 'zod';

/** The signed-in operator, resolved by the guard for every console request. */
export interface AdminIdentity {
  readonly uid: string;
  readonly email: string;
  readonly name: string;
  readonly roles: readonly AdminRole[];
  readonly sessionExpiresAt: Date;
  readonly ipHash: string | null;
}

export interface AdminCommandContext extends CommandContext {
  readonly admin: AdminIdentity;
}

export interface AdminAuditTarget {
  readonly targetKind: string;
  readonly targetId?: string | null;
  readonly reason?: string | null;
  readonly detail?: Readonly<Record<string, unknown>>;
  /** A human label for the audit list ("Maya Chen · Pass+ 30 days"); defaults to the action name. */
  readonly summary?: string;
  /** Before/after per field; defaults to the diff of `detail.before`/`detail.after` when present. */
  readonly changes?: readonly AuditChange[];
}

export interface AdminCommandDefinition<Payload, Result> {
  readonly name: string;
  readonly schema: z.ZodType<Payload>;
  /**
   * The audit row's subject. `'self'` = the handler writes its own audit row (a handler shared with
   * another door, such as `upsert_poi`); the pipeline then writes none, so there is still one.
   */
  readonly audit: ((payload: Payload, result: Result) => AdminAuditTarget | 'self') | 'self';
  /** Runs as `app_system` inside the pipeline's transaction, after the role policy passed. */
  readonly handle: (
    tx: pg.PoolClient,
    payload: Payload,
    ctx: AdminCommandContext,
  ) => Promise<Result>;
}

export type AnyAdminCommand = AdminCommandDefinition<unknown, unknown>;

export function defineAdminCommand<Payload, Result>(
  definition: AdminCommandDefinition<Payload, Result>,
): AnyAdminCommand {
  return definition as unknown as AnyAdminCommand;
}

/** Operator e-mails for "changed by" columns (console accounts only, never app users). */
export interface OperatorDirectory {
  emails(uids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

export interface AdminReadContext<Query, Params> {
  readonly admin: AdminIdentity;
  readonly operators: OperatorDirectory;
  readonly query: Query;
  readonly params: Params;
}

export interface AdminReadDefinition<Query, Params, Response> {
  /** Relative to `/v1/admin`, in OpenAPI style (`/catalogue/{kind}`). */
  readonly path: string;
  readonly area: AdminArea;
  readonly summary: string;
  readonly query?: z.ZodType<Query>;
  readonly params?: z.ZodType<Params>;
  readonly response: z.ZodType<Response>;
  readonly run: (ctx: AdminReadContext<Query, Params>) => Promise<Response>;
}

export type AnyAdminRead = AdminReadDefinition<unknown, unknown, unknown>;

export function defineAdminRead<Query, Params, Response>(
  definition: AdminReadDefinition<Query, Params, Response>,
): AnyAdminRead {
  return definition as unknown as AnyAdminRead;
}

/** One open item of a work queue, as its source reads it. */
export interface WorkSourceItem {
  readonly item_id: string;
  readonly title: string;
  readonly due_at: Date | null;
  /** The source's own assignee column, when it has one (desk tasks, moderation reports). */
  readonly assignee: string | null;
}

/**
 * A queue whose items operators claim (`claim_work_item`) and see in `/work`. `open` runs as
 * admin_reader in reads and as app_system in commands; `assign` mirrors a claim into the source's
 * own assignee column, inside the command's transaction.
 */
export interface AdminWorkSource {
  readonly queue: string;
  /** Who may see and claim its items: whoever may open this area. */
  readonly area: AdminArea;
  open(tx: pg.PoolClient, ids?: readonly string[]): Promise<readonly WorkSourceItem[]>;
  assign?(tx: pg.PoolClient, itemId: string, adminUid: string | null): Promise<void>;
  /** Audit actions that close an item, for "done today" (optionally only with these statuses). */
  readonly closes: { readonly action: string; readonly statuses?: readonly string[] };
}

/** An area's badge for `/v1/admin/counts`; runs as admin_reader. */
export interface AdminAreaCount {
  readonly area: AdminArea;
  run(tx: pg.PoolClient, now: Date): Promise<AreaCount>;
}

export interface AdminAreaDefinition {
  readonly id: string;
  readonly reads: readonly AnyAdminRead[];
  readonly commands: readonly AnyAdminCommand[];
  readonly count?: AdminAreaCount;
  readonly work?: AdminWorkSource;
}

export function defineAdminArea(definition: AdminAreaDefinition): AdminAreaDefinition {
  return definition;
}

export interface AdminRegistry {
  command(name: string): AnyAdminCommand | undefined;
  commandNames(): readonly string[];
  reads(): readonly AnyAdminRead[];
  counts(): readonly AdminAreaCount[];
  workSources(): readonly AdminWorkSource[];
}

export function createAdminRegistry(areas: readonly AdminAreaDefinition[]): AdminRegistry {
  const commands = new Map<string, AnyAdminCommand>();
  const reads: AnyAdminRead[] = [];
  const paths = new Set<string>();
  const counts: AdminAreaCount[] = [];
  const work = new Map<string, AdminWorkSource>();
  for (const area of areas) {
    if (area.count !== undefined) counts.push(area.count);
    if (area.work !== undefined) {
      if (work.has(area.work.queue)) throw new Error(`work queue ${area.work.queue} is registered`);
      work.set(area.work.queue, area.work);
    }
    for (const command of area.commands) {
      if (commands.has(command.name)) {
        throw new Error(`admin command ${command.name} is already registered`);
      }
      commands.set(command.name, command);
    }
    for (const read of area.reads) {
      if (paths.has(read.path)) throw new Error(`admin read ${read.path} is already registered`);
      paths.add(read.path);
      reads.push(read);
    }
  }
  return {
    command: (name) => commands.get(name),
    commandNames: () => [...commands.keys()].sort(),
    reads: () => reads,
    counts: () => counts,
    workSources: () => [...work.values()],
  };
}
