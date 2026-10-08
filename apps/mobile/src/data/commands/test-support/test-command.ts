/**
 * A client command under a name only a test's own server (or no server) knows. App code declares
 * its commands with `defineClientCommand`, whose names are checked against the api's list.
 */
import type { RegisteredCommandName } from '@cp/domain';

import type { ClientCommandSpec } from '../summaries';

export function defineTestCommand<Payload>(
  spec: Omit<ClientCommandSpec<Payload>, 'name'> & { readonly name: string },
): ClientCommandSpec<Payload> {
  return { ...spec, name: spec.name as RegisteredCommandName };
}
