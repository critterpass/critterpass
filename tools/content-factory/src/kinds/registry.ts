import type { ContentKind } from '@cp/content';

import type { AnyKindModule, KindModule } from './types';

const modules = new Map<ContentKind, AnyKindModule>();

export function registerKind<K extends ContentKind>(module: KindModule<K>): void {
  if (modules.has(module.kind))
    throw new Error(`content kind ${module.kind} is already registered`);
  modules.set(module.kind, module);
}

export function kindModule(kind: ContentKind): AnyKindModule {
  const module = modules.get(kind);
  if (module === undefined) throw new Error(`no content factory module for ${kind}`);
  return module;
}

export function registeredKinds(): readonly ContentKind[] {
  return [...modules.keys()];
}
