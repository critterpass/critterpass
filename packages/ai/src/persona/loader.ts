/**
 * Persona loading for chat: the latest approved release in `persona_packs` (read through
 * llm.persona_packs) wins; otherwise the guide's own pack ships (`./resolve`: the repo pack, or
 * the pack built from its critter's facts). A release that fails validation never reaches a
 * prompt: the guide's own pack is used and the rejection is reported to the caller.
 */
import ajo from '../../personas/ajo.json' with { type: 'json' };
import chava from '../../personas/chava.json' with { type: 'json' };
import guest from '../../personas/guest.json' with { type: 'json' };
import lundi from '../../personas/lundi.json' with { type: 'json' };
import paco from '../../personas/paco.json' with { type: 'json' };
import pon from '../../personas/pon.json' with { type: 'json' };
import sardi from '../../personas/sardi.json' with { type: 'json' };
import tokek from '../../personas/tokek.json' with { type: 'json' };

import {
  personaPackSchema,
  type PersonaId,
  type PersonaPack,
  type WrittenPersonaId,
} from './schema';

const RAW_REPO_PACKS: Readonly<Record<WrittenPersonaId, unknown>> = {
  tokek,
  pon,
  lundi,
  ajo,
  sardi,
  paco,
  chava,
  guest,
};

export function parseRepoPacks(): Readonly<Record<WrittenPersonaId, PersonaPack>> {
  return Object.fromEntries(
    Object.entries(RAW_REPO_PACKS).map(([id, raw]) => [id, personaPackSchema.parse(raw)]),
  ) as Record<WrittenPersonaId, PersonaPack>;
}

/** Validated once at module load: a malformed repo pack fails the process at boot. */
export const REPO_PACKS = parseRepoPacks();

/** One row of llm.persona_packs. */
export interface ApprovedPersonaRow {
  readonly guide_slug: string;
  readonly version: string;
  readonly style: unknown;
  readonly lexicon: unknown;
  readonly voice_settings: unknown;
}

/** Looks up the latest approved release for a live guide (null when none). */
export type PersonaReleaseSource = (guideSlug: string) => Promise<ApprovedPersonaRow | null>;

/** Query text for a source backed by a `guide_reader` transaction. */
export const LATEST_APPROVED_PERSONA_SQL = `SELECT guide_slug, version, style, lexicon, voice_settings
  FROM llm.persona_packs WHERE guide_slug = $1 ORDER BY approved_at DESC LIMIT 1`;

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/** Rebuilds a pack from a release row: style + lexicon.local_words + voice_settings.voice_id. */
export function personaFromRelease(id: PersonaId, row: ApprovedPersonaRow) {
  return personaPackSchema.safeParse({
    ...record(row.style),
    id,
    version: row.version,
    status: 'approved',
    local_words: record(row.lexicon)['local_words'],
    voice_id: record(row.voice_settings)['voice_id'] ?? null,
  });
}
