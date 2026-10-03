/**
 * `recap.narrate`: the guide's voice over each story card (ElevenLabs Flash in the guide's own
 * voice, the phrase cards' client), stored in R2 as a media object on the trip so `POST
 * /v1/media/read-urls` signs it for the crew. `recaps.narration` keeps, per locale and card, the key
 * and the hash of the words it reads: a re-run whose words did not change records nothing, so the
 * cost is at most one call per card per changed version. Without a voice configured, or when a
 * call fails, the card keeps its text narration and the recap stays `ready`; a failed card is
 * tried again on the next run.
 */
import { createHash } from 'node:crypto';

import { personaIdSchema, REPO_PACKS } from '@cp/ai';
import { withSystem } from '@cp/db';
import {
  generateUuidV7,
  RECAP_CARDS,
  RECAP_QUEUES,
  recapCardsCopySchema,
  recapNarrateJobSchema,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import type { TtsProvider } from '../guide/elevenlabs';

/** The language the guide writes the recap copy in. */
export const NARRATION_LOCALE = 'en';

export interface RecapVoice {
  readonly tts: TtsProvider;
  readonly store: { put(key: string, bytes: Uint8Array, contentType: string): Promise<void> };
  /** Voice for guides whose persona names none. */
  readonly defaultVoiceId: string;
}

export interface NarrationEntry {
  readonly media_key: string;
  readonly hash: string;
}

type Narration = Record<string, Record<string, NarrationEntry>>;

export type NarrateOutcome =
  | { readonly outcome: 'no_voice' | 'no_recap' | 'no_copy' }
  | { readonly outcome: 'narrated'; readonly recorded: number; readonly failed: number };

const hashOf = (text: string, voiceId: string) =>
  createHash('sha256').update(`${voiceId}\n${text}`).digest('hex');

interface Source {
  readonly tripId: string;
  readonly ownerId: string;
  readonly copyVersion: number;
  readonly voiceId: string;
  readonly texts: ReadonlyMap<string, string>;
  readonly narration: Narration;
}

async function loadSource(
  tx: pg.PoolClient,
  recapId: string,
  defaultVoiceId: string,
): Promise<Source | 'no_recap' | 'no_copy'> {
  const { rows } = await tx.query<{
    trip_id: string;
    owner_id: string;
    copy_version: number;
    cards: unknown;
    narration: Narration;
    guide: string | null;
  }>(
    `SELECT r.trip_id, r.copy_version, r.cards, r.narration, g.slug AS guide,
            (SELECT v.user_id FROM recap_views v WHERE v.recap_id = r.id ORDER BY v.user_id
              LIMIT 1) AS owner_id
       FROM recaps r JOIN trips t ON t.id = r.trip_id LEFT JOIN guides g ON g.id = t.guide_id
      WHERE r.id = $1`,
    [recapId],
  );
  const row = rows[0];
  if (row === undefined || row.owner_id === null) return 'no_recap';
  const cards = recapCardsCopySchema.safeParse(row.cards);
  if (!cards.success || row.copy_version === 0) return 'no_copy';
  const persona = personaIdSchema.safeParse(row.guide);
  const voiceId = (persona.success ? REPO_PACKS[persona.data].voice_id : null) ?? defaultVoiceId;
  const texts = new Map<string, string>();
  for (const card of RECAP_CARDS) {
    const narration = cards.data[card]?.narration;
    if (narration !== undefined) texts.set(card, narration);
  }
  return {
    tripId: row.trip_id,
    ownerId: row.owner_id,
    copyVersion: row.copy_version,
    voiceId,
    texts,
    narration: row.narration,
  };
}

/** Records every card whose words changed since its last recording; the rest stay as they are. */
export async function narrateRecap(
  pool: pg.Pool,
  recapId: string,
  voice: RecapVoice | undefined,
): Promise<NarrateOutcome> {
  if (voice === undefined) return { outcome: 'no_voice' };
  const source = await withSystem(pool, (tx) => loadSource(tx, recapId, voice.defaultVoiceId));
  if (typeof source === 'string') return { outcome: source };
  const current = source.narration[NARRATION_LOCALE] ?? {};
  const next: Record<string, NarrationEntry> = { ...current };
  const recorded: { key: string; bytes: number; sha256: string }[] = [];
  let failed = 0;
  for (const [card, text] of source.texts) {
    const hash = hashOf(text, source.voiceId);
    if (current[card]?.hash === hash) continue;
    try {
      const audio = await voice.tts.synthesize({
        text,
        language: NARRATION_LOCALE,
        voiceId: source.voiceId,
      });
      const key = `u/${source.ownerId}/recap_audio/${generateUuidV7()}`;
      await voice.store.put(key, audio, 'audio/mpeg');
      recorded.push({
        key,
        bytes: audio.byteLength,
        sha256: createHash('sha256').update(audio).digest('hex'),
      });
      next[card] = { media_key: key, hash };
    } catch {
      failed += 1;
    }
  }
  if (recorded.length > 0) {
    await withSystem(pool, async (tx) => {
      for (const audio of recorded) {
        await tx.query(
          `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256, purpose, trip_id)
           SELECT $1, $2, 'audio/mpeg', $3, $4, 'recap_audio', $5
            WHERE NOT EXISTS (SELECT 1 FROM media_objects WHERE owner_id = $1 AND r2_key = $2)`,
          [source.ownerId, audio.key, audio.bytes, audio.sha256, source.tripId],
        );
      }
      await tx.query(
        `UPDATE recaps SET narration = jsonb_set(narration, ARRAY[$2], $3::jsonb, true)
          WHERE id = $1 AND copy_version = $4`,
        [recapId, NARRATION_LOCALE, JSON.stringify(next), source.copyVersion],
      );
    });
  }
  return { outcome: 'narrated', recorded: recorded.length, failed };
}

export function recapNarrateJob(voice: RecapVoice | undefined): AnyJobDefinition {
  return defineJob({
    queue: RECAP_QUEUES.narrate,
    schema: recapNarrateJobSchema,
    async handler(data, { pool }) {
      return { ...(await narrateRecap(pool, data.recap_id, voice)) };
    },
  });
}
