/**
 * The command registry every door resolves against (docs/api-contracts.md §2.2: "one handler
 * registry"). Handler modules register at boot; a name registers once, so two modules can never
 * silently shadow each other.
 */
import type { DbCommandDefinition, DbCommandResolver } from '@cp/db';

import {
  INSTALL_KEYED_COMMANDS,
  onRegisteredInstall,
  type InstallStandInReporter,
} from '../device/registered-install';

type ErasedDefinition = DbCommandDefinition<unknown, unknown>;

export interface CommandRegistry {
  register<Payload, Result>(definition: DbCommandDefinition<Payload, Result>): void;
  resolve: DbCommandResolver;
  names(): readonly string[];
}

export interface CommandRegistryOptions {
  /** Told when an install-keyed command ran on the caller's stand-in device. */
  readonly onInstallStandIn?: InstallStandInReporter;
}

export function createCommandRegistry(options: CommandRegistryOptions = {}): CommandRegistry {
  const byName = new Map<string, ErasedDefinition>();

  return {
    register(definition) {
      if (byName.has(definition.name)) {
        throw new Error(`command ${definition.name} is already registered`);
      }
      // Payload types are erased at the registry boundary; the pipeline validates each payload
      // with the definition's own schema before any hook sees it, so the hooks' input still holds.
      const erased = definition as unknown as ErasedDefinition;
      // Install-keyed commands act on the device the caller registered (../device/registered-install).
      byName.set(
        definition.name,
        INSTALL_KEYED_COMMANDS.has(definition.name)
          ? onRegisteredInstall(erased, options.onInstallStandIn)
          : erased,
      );
    },
    resolve: (name) => byName.get(name),
    names: () => [...byName.keys()].sort(),
  };
}
