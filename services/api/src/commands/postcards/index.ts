/**
 * The postcards' api mount: making, sending and mailing postcards, the recipient's own sealed
 * address (only with the field-encryption keyring), whether the caller saved one, and the print
 * partner's callback (only with its path token configured).
 */
import { ensureInboxKinds, POSTCARD_INBOX_KINDS } from '@cp/domain';
import type { KillSwitchReader } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../../app';
import { createKillSwitches } from '../../ops/kill-switches';
import { registerPrintWebhook } from '../../routes/webhooks/print';
import type { CommandRegistry } from '../_framework/registry';
import type { SessionResolver } from '../_framework/session';
import { registerMailingAddressRoute } from './address-route';
import { createPostcardCommand } from './create-postcard';
import { editPostcardCommand } from './edit-postcard';
import { mailPostcardCommand } from './mail-postcard';
import { createSaveMailingAddressCommand, type FieldKeyring } from './save-mailing-address';
import { sendPostcardCommand } from './send-postcard';

ensureInboxKinds(POSTCARD_INBOX_KINDS);

export function registerPostcardCommands(
  registry: CommandRegistry,
  deps: {
    readonly switches: Pick<KillSwitchReader, 'assertOn'>;
    readonly keyring?: FieldKeyring | undefined;
  },
): void {
  registry.register(createPostcardCommand);
  registry.register(editPostcardCommand);
  registry.register(sendPostcardCommand);
  registry.register(mailPostcardCommand(deps.switches));
  if (deps.keyring !== undefined) {
    registry.register(createSaveMailingAddressCommand({ keyring: deps.keyring }));
  }
}

export function registerPostcards(
  app: OpenAPIHono<AppEnv>,
  doors: {
    readonly registry: CommandRegistry;
    readonly pool: pg.Pool;
    readonly sessions: SessionResolver;
  },
  keyring: FieldKeyring | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  registerPostcardCommands(doors.registry, { switches: createKillSwitches(doors.pool), keyring });
  registerMailingAddressRoute(app, doors);
  const token = env['PRINT_WEBHOOK_TOKEN'];
  if (token !== undefined && token.length >= 32) {
    registerPrintWebhook(app, { pool: doors.pool, token });
  }
}
