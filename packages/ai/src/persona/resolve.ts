/**
 * The one way a guide slug becomes a persona pack, for every route: the pack written in the repo
 * when the guide has one, else the pack built from its critter's facts, else (a slug no critter
 * folds to) Tokek's. Chat reads an approved release first and falls back to this.
 */
import { guideFactsBySlug } from '@cp/critter-art/guides';

import { personaFromRelease, REPO_PACKS, type PersonaReleaseSource } from './loader';
import { isWrittenPersonaId, type PersonaId, type PersonaPack } from './schema';
import { templatePersonaPack } from './template';

const TEMPLATES = new Map<string, PersonaPack>();

export function resolvePersonaPack(id: PersonaId | null | undefined): PersonaPack {
  if (id == null) return REPO_PACKS.tokek;
  if (isWrittenPersonaId(id)) return REPO_PACKS[id];
  const built = TEMPLATES.get(id);
  if (built !== undefined) return built;
  const facts = guideFactsBySlug(id);
  if (facts === undefined) return REPO_PACKS.tokek;
  const pack = templatePersonaPack(facts);
  TEMPLATES.set(id, pack);
  return pack;
}

export interface LoadedPersona {
  readonly pack: PersonaPack;
  readonly origin: 'release' | 'repo' | 'template';
  /** Why an approved release was not used, when one existed. */
  readonly rejected?: string;
}

export async function loadPersonaPack(
  id: PersonaId,
  source?: PersonaReleaseSource,
): Promise<LoadedPersona> {
  const pack = resolvePersonaPack(id);
  const own = { pack, origin: pack.learning == null ? 'repo' : 'template' } as const;
  // The guest guide is a mode of the base guide's pack, versioned with the repo only.
  if (source === undefined || pack.guest_mode !== null) return own;
  const row = await source(pack.id);
  if (row === null) return own;
  const parsed = personaFromRelease(pack.id, row);
  if (!parsed.success) {
    const rejected = `release ${row.version}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`;
    return { ...own, rejected };
  }
  return { pack: parsed.data, origin: 'release' };
}
