/**
 * `recap.narrate`: the guide's voice over each story card, in every language the recap's viewers
 * read it in (ElevenLabs in the guide's own voice, the phrase cards' client: Flash for the
 * languages it speaks, v3 for the rest). A language other than the guide's gets its narration once
 * the card copy is translated (`guide_text.translate` queues this job again when it is); a card
 * whose translation was refused is read in the words its readers see, the guide's own.
 *
 * The audio is trip media, owned by no traveller (`t/<trip>/recap_audio/<id>`), so purging any
 * account leaves the crew's narration in place; `POST /v1/media/read-urls` signs it for the recap's
 * viewers. `recaps.narration` keeps, per locale and card, the key and the hash of the words and the
 * language it reads: a re-run whose words did not change records nothing in that locale. Without a
 * voice, or when a call fails, the card keeps its text and the recap stays `ready`; a failed card
 * is tried again on the next run.
 */
import { createHash } from 'node:crypto';

import { personaIdSchema, resolvePersonaPack } from '@cp/ai';
import { withSystem } from '@cp/db';
import {
  generateUuidV7,
  guideText,
  guideTextLocales,
  parseGuideTextI18n,
  RECAP_CARDS,
  RECAP_QUEUES,
  recapGuideTextSource,
  recapNarrateJobSchema,
  SOURCE_APP_LOCALE,
  type GuideTextSource,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import type { TtsProvider } from '../guide/elevenlabs';

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
  | {
      readonly outcome: 'narrated';
      readonly recorded: number;
      readonly failed: number;
      /** Viewer languages still waiting for their translation. */
      readonly waiting: readonly string[];
    };

/** Bumped when the stored audio's layout changes, so every card is recorded again once. */
const NARRATION_LAYOUT = 'trip-media';

const hashOf = (text: string, language: string, voiceId: string) =>
  createHash('sha256')
    .update(`${NARRATION_LAYOUT}\n${voiceId}\n${language}\n${text}`)
    .digest('hex');

interface Source {
  readonly tripId: string;
  readonly copyVersion: number;
  readonly voiceId: string;
  readonly cards: GuideTextSource;
  readonly i18n: unknown;
  readonly locales: readonly string[];
  readonly narration: Narration;
}

async function loadSource(
  tx: pg.PoolClient,
  recapId: string,
  defaultVoiceId: string,
): Promise<Source | 'no_recap' | 'no_copy'> {
  const { rows } = await tx.query<{
    trip_id: string;
    copy_version: number;
    cards: unknown;
    i18n: unknown;
    narration: Narration;
    guide: string | null;
    locales: string[] | null;
  }>(
    `SELECT r.trip_id, r.copy_version, r.cards, r.i18n, r.narration, g.slug AS guide,
            (SELECT array_agg(DISTINCT app.user_locale(v.user_id) ORDER BY app.user_locale(v.user_id))
               FROM recap_views v WHERE v.recap_id = r.id) AS locales
       FROM recaps r JOIN trips t ON t.id = r.trip_id LEFT JOIN guides g ON g.id = t.guide_id
      WHERE r.id = $1`,
    [recapId],
  );
  const row = rows[0];
  if (row === undefined) return 'no_recap';
  if (row.copy_version === 0) return 'no_copy';
  const persona = personaIdSchema.safeParse(row.guide);
  return {
    tripId: row.trip_id,
    copyVersion: row.copy_version,
    voiceId: (persona.success ? resolvePersonaPack(persona.data).voice_id : null) ?? defaultVoiceId,
    cards: recapGuideTextSource(row.cards),
    i18n: row.i18n,
    locales: row.locales ?? [SOURCE_APP_LOCALE],
    narration: row.narration,
  };
}

/** What each card says in `locale`, and the language those words are in. */
function linesFor(
  source: Source,
  locale: string,
): { card: string; text: string; language: string }[] {
  const lines: { card: string; text: string; language: string }[] = [];
  for (const card of RECAP_CARDS) {
    const field = `${card}_narration`;
    const original = source.cards[field];
    if (original === null || original === undefined || original === '') continue;
    const text = guideText('recap', source.cards, source.i18n, field, locale) ?? original;
    lines.push({ card, text, language: text === original ? SOURCE_APP_LOCALE : locale });
  }
  return lines;
}

/** Records every card whose words changed since its last recording, per viewer language. */
export async function narrateRecap(
  pool: pg.Pool,
  recapId: string,
  voice: RecapVoice | undefined,
): Promise<NarrateOutcome> {
  if (voice === undefined) return { outcome: 'no_voice' };
  const source = await withSystem(pool, (tx) => loadSource(tx, recapId, voice.defaultVoiceId));
  if (typeof source === 'string') return { outcome: source };
  const translated = new Set(
    guideTextLocales('recap', source.cards, parseGuideTextI18n(source.i18n)),
  );
  const ready = source.locales.filter(
    (locale) => locale === SOURCE_APP_LOCALE || translated.has(locale),
  );
  const waiting = source.locales.filter((locale) => !ready.includes(locale));
  const next: Narration = {};
  const recorded: { key: string; bytes: number; sha256: string }[] = [];
  let failed = 0;
  for (const locale of ready) {
    const current = source.narration[locale] ?? {};
    const entries: Record<string, NarrationEntry> = { ...current };
    for (const line of linesFor(source, locale)) {
      const hash = hashOf(line.text, line.language, source.voiceId);
      if (current[line.card]?.hash === hash) continue;
      try {
        const audio = await voice.tts.synthesize({
          text: line.text,
          language: line.language,
          voiceId: source.voiceId,
        });
        const key = `t/${source.tripId}/recap_audio/${generateUuidV7()}`;
        await voice.store.put(key, audio, 'audio/mpeg');
        recorded.push({
          key,
          bytes: audio.byteLength,
          sha256: createHash('sha256').update(audio).digest('hex'),
        });
        entries[line.card] = { media_key: key, hash };
      } catch {
        failed += 1;
      }
    }
    next[locale] = entries;
  }
  if (recorded.length > 0) {
    await withSystem(pool, async (tx) => {
      for (const audio of recorded) {
        await tx.query(
          `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256, purpose, trip_id)
           VALUES (NULL, $1, 'audio/mpeg', $2, $3, 'recap_audio', $4)
           ON CONFLICT (r2_key) WHERE owner_id IS NULL DO NOTHING`,
          [audio.key, audio.bytes, audio.sha256, source.tripId],
        );
      }
      await tx.query(
        `UPDATE recaps SET narration = narration || $2::jsonb
          WHERE id = $1 AND copy_version = $3`,
        [recapId, JSON.stringify(next), source.copyVersion],
      );
    });
  }
  return { outcome: 'narrated', recorded: recorded.length, failed, waiting };
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
