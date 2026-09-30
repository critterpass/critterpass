/**
 * The supplier commands (docs/api-contracts.md §4.11), registered by `registerSupplierRoutes`.
 */
import type { CommandRegistry } from '../_framework/registry';
import { createRecordSupplierClickCommand, type SupplierClickDeps } from './record-supplier-click';

export type SupplierCommandDeps = SupplierClickDeps;

export function registerSupplierCommands(
  registry: CommandRegistry,
  deps: SupplierCommandDeps,
): void {
  registry.register(createRecordSupplierClickCommand(deps));
}
