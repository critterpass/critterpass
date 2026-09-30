/**
 * Saved lists (docs/api-contracts-explore.md): a traveller's own named lists under Explore's
 * "Saved" hub. Create is idempotent on the client's list id (or the name), rename carries the
 * list's items along, delete moves them back to the default "Saved" list, and move files one saved
 * item into a list. Everything is the caller's own: RLS scopes every row to them.
 */
import {
  createSavedListPayloadSchema,
  deleteSavedListPayloadSchema,
  DomainError,
  generateUuidV7,
  moveSavedItemPayloadSchema,
  renameSavedListPayloadSchema,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import type { CommandRegistry } from '../_framework/registry';

interface ListRow {
  readonly id: string;
  readonly name: string;
  readonly position: number;
}

async function ownList(tx: pg.PoolClient, listId: string): Promise<ListRow> {
  const { rows } = await tx.query<ListRow>(
    'SELECT id, name, position FROM saved_lists WHERE id = $1 AND user_id = app.uid() FOR UPDATE',
    [listId],
  );
  const list = rows[0];
  if (list === undefined) throw new DomainError('NOT_FOUND', { reason: 'list' });
  return list;
}

async function nameTaken(tx: pg.PoolClient, name: string, except: string | null): Promise<boolean> {
  const { rows } = await tx.query(
    'SELECT 1 FROM saved_lists WHERE user_id = app.uid() AND name = $1 AND id IS DISTINCT FROM $2',
    [name, except],
  );
  return rows.length > 0;
}

export const createSavedListCommand = defineCommand({
  name: 'create_saved_list',
  v: 1,
  schema: createSavedListPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<ListRow> => {
    const { rows: existing } = await tx.query<ListRow>(
      'SELECT id, name, position FROM saved_lists WHERE user_id = $1 AND (id = $2 OR name = $3)',
      [ctx.uid, payload.list_id ?? null, payload.name],
    );
    if (existing[0] !== undefined) return existing[0];
    const { rows } = await tx.query<ListRow>(
      `INSERT INTO saved_lists (id, user_id, name, position)
       SELECT $1, $2, $3, coalesce($4, coalesce(max(position) + 1, 0))
         FROM saved_lists WHERE user_id = $2
       RETURNING id, name, position`,
      [payload.list_id ?? generateUuidV7(), ctx.uid, payload.name, payload.position ?? null],
    );
    return rows[0] as ListRow;
  },
});

export const renameSavedListCommand = defineCommand({
  name: 'rename_saved_list',
  v: 1,
  schema: renameSavedListPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await ownList(tx, payload.list_id);
  },
  handle: async (tx, payload, ctx): Promise<ListRow> => {
    const list = await ownList(tx, payload.list_id);
    if (await nameTaken(tx, payload.name, list.id)) {
      throw new DomainError('STATE_INVALID', { reason: 'list_name_taken' });
    }
    await tx.query('UPDATE saved_items SET list_name = $2 WHERE user_id = $1 AND list_name = $3', [
      ctx.uid,
      payload.name,
      list.name,
    ]);
    const { rows } = await tx.query<ListRow>(
      `UPDATE saved_lists SET name = $2, position = coalesce($3, position) WHERE id = $1
       RETURNING id, name, position`,
      [list.id, payload.name, payload.position ?? null],
    );
    return rows[0] as ListRow;
  },
});

export const deleteSavedListCommand = defineCommand({
  name: 'delete_saved_list',
  v: 1,
  schema: deleteSavedListPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<{ list_id: string; deleted: boolean }> => {
    const { rows } = await tx.query<ListRow>(
      'SELECT id, name, position FROM saved_lists WHERE id = $1 AND user_id = $2',
      [payload.list_id, ctx.uid],
    );
    const list = rows[0];
    if (list === undefined) return { list_id: payload.list_id, deleted: false };
    await tx.query(
      'UPDATE saved_items SET list_name = NULL WHERE user_id = $1 AND list_name = $2',
      [ctx.uid, list.name],
    );
    // app_user holds no DELETE anywhere: the owner's row goes as the server, after the check above.
    await asSystemRole(tx, () =>
      tx.query('DELETE FROM saved_lists WHERE id = $1 AND user_id = $2', [list.id, ctx.uid]),
    );
    return { list_id: list.id, deleted: true };
  },
});

export const moveSavedItemCommand = defineCommand({
  name: 'move_saved_item',
  v: 1,
  schema: moveSavedItemPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const { rows } = await tx.query(
      'SELECT 1 FROM saved_items WHERE id = $1 AND user_id = app.uid()',
      [payload.item_id],
    );
    if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'saved_item' });
  },
  handle: async (tx, payload, ctx): Promise<{ item_id: string; list_name: string | null }> => {
    if (payload.list_name !== null) {
      await tx.query(
        `INSERT INTO saved_lists (user_id, name, position)
         SELECT $1, $2, coalesce(max(position) + 1, 0) FROM saved_lists WHERE user_id = $1
         ON CONFLICT (user_id, name) DO NOTHING`,
        [ctx.uid, payload.list_name],
      );
    }
    await tx.query('UPDATE saved_items SET list_name = $3 WHERE id = $1 AND user_id = $2', [
      payload.item_id,
      ctx.uid,
      payload.list_name,
    ]);
    return { item_id: payload.item_id, list_name: payload.list_name };
  },
});

export function registerSavedListCommands(registry: CommandRegistry): void {
  registry.register(createSavedListCommand);
  registry.register(renameSavedListCommand);
  registry.register(deleteSavedListCommand);
  registry.register(moveSavedItemCommand);
}
