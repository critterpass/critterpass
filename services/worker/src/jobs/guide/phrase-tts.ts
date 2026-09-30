/**
 * `phrase.tts` (doc delta, docs/api-contracts-async.md §2.2): a custom phrase card's text and audio.
 * A card without curated text is translated by the model (the purpose is the member's words, sent
 * as data; the address is kept verbatim, never translated). With a voice configured the card is
 * read in the trip guide's voice and stored in R2 for the offline bundle; without one it is marked
 * for the app's on-device speech. Three tries, then the card is marked failed.
 */
import {
  GUIDE_OFFER_ROUTE,
  isDeclined,
  packFor,
  renderPersonaBlock,
  textOf,
  userTurnWithData,
  wrapUntrusted,
  type Gateway,
} from '@cp/ai';
import { emitEvent, withSystem } from '@cp/db';
import { GUIDE_QUEUES, phraseJobSchema } from '@cp/domain';
import type pg from 'pg';

import { defineJob } from '../../boss';
import type { TtsProvider } from './elevenlabs';
import { guideReader, type GuideRuntime } from './runtime';

export interface PhraseVoice {
  readonly tts: TtsProvider;
  readonly store: { put(key: string, bytes: Uint8Array, contentType: string): Promise<void> };
  /** Voice for guides whose persona names none. */
  readonly defaultVoiceId: string;
}

interface Card {
  readonly id: string;
  readonly user_id: string;
  readonly trip_id: string;
  readonly purpose: string;
  readonly language: string;
  readonly register: string;
  readonly address: string | null;
  readonly text: string | null;
  readonly audio_status: string;
  readonly guide_slug: string | null;
}

export function phraseAudioKey(card: Pick<Card, 'id' | 'user_id'>): string {
  return `phrase_audio/${card.user_id}/${card.id}.mp3`;
}

/** The phrase in `language`, from the model; the purpose reaches it only as data. */
export async function translatePhrase(
  gateway: Pick<Gateway, 'callModel'>,
  card: Pick<Card, 'purpose' | 'language' | 'register' | 'user_id' | 'trip_id'>,
  personaBlock: string,
): Promise<string | null> {
  const result = await gateway.callModel(
    GUIDE_OFFER_ROUTE,
    {
      system: [
        { type: 'text', text: personaBlock },
        {
          type: 'text',
          text: `Translate the traveller's phrase in the data into the language with BCP 47 tag "${card.language}", in a ${card.register} register, as a local would say it to a driver or shop staff. Reply with the translated phrase only: no quotes, no notes, no transliteration.`,
        },
      ],
      messages: [
        userTurnWithData('Translate the phrase.', [
          wrapUntrusted({ kind: 'place_tip', text: card.purpose, source: 'phrase_request' }),
        ]),
      ],
      temperature: 0.2,
    },
    { userId: card.user_id, tripId: card.trip_id },
  );
  if (isDeclined(result.message)) return null;
  const text = textOf(result.message).trim();
  return text === '' || text.length > 300 ? null : text;
}

async function loadCard(pool: pg.Pool, id: string): Promise<Card | undefined> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<Card>(
      `SELECT c.id, c.user_id, c.trip_id, c.purpose, c.language, c.register, c.address, c.text,
              c.audio_status, g.slug AS guide_slug
         FROM custom_phrase_cards c
         LEFT JOIN guides g ON g.id = c.guide_id
        WHERE c.id = $1`,
      [id],
    ),
  );
  return rows[0];
}

async function finish(
  pool: pg.Pool,
  card: Card,
  fields: {
    text: string | null;
    gloss: string | null;
    audioKey: string | null;
    status: 'ready' | 'device' | 'failed';
  },
): Promise<void> {
  await withSystem(pool, async (tx) => {
    await tx.query(
      `UPDATE custom_phrase_cards
          SET text = coalesce(text, $2), gloss = coalesce(gloss, $3), audio_key = $4, audio_status = $5
        WHERE id = $1`,
      [card.id, fields.text, fields.gloss, fields.audioKey, fields.status],
    );
    await emitEvent(tx, {
      type: 'phrase.ready',
      aggregateKind: 'custom_phrase_card',
      aggregateId: card.id,
      actorKind: 'guide',
      actorId: null,
      tripId: card.trip_id,
      payload: { card_id: card.id, user_id: card.user_id, audio_status: fields.status },
    });
  });
}

export function phraseTtsJob(runtime: GuideRuntime, voice: PhraseVoice | undefined) {
  return defineJob({
    queue: GUIDE_QUEUES.phrase,
    schema: phraseJobSchema,
    singletonKey: (data) => data.card_id,
    async handler(data, ctx) {
      const card = await loadCard(runtime.pool, data.card_id);
      if (card === undefined || card.audio_status !== 'pending') return { outcome: 'done' };
      try {
        const pack = await packFor(
          guideReader(runtime.pool),
          card.user_id,
          card.trip_id,
          card.guide_slug,
        );
        let text = card.text;
        let gloss: string | null = null;
        if (text === null) {
          const phrase = await translatePhrase(runtime.gateway, card, renderPersonaBlock(pack));
          if (phrase === null) throw new Error('the model returned no phrase');
          text = card.address === null ? phrase : `${phrase}\n${card.address}`;
          gloss = card.address === null ? card.purpose : `${card.purpose}\n${card.address}`;
        }
        if (voice === undefined) {
          await finish(runtime.pool, card, { text, gloss, audioKey: null, status: 'device' });
          return { outcome: 'device' };
        }
        const audio = await voice.tts.synthesize({
          text,
          language: card.language,
          voiceId: pack.voice_id ?? voice.defaultVoiceId,
        });
        const key = phraseAudioKey(card);
        await voice.store.put(key, audio, 'audio/mpeg');
        await finish(runtime.pool, card, { text, gloss, audioKey: key, status: 'ready' });
        return { outcome: 'ready' };
      } catch (error) {
        if (!ctx.job.isFinalAttempt) throw error;
        await finish(runtime.pool, card, {
          text: null,
          gloss: null,
          audioKey: null,
          status: 'failed',
        });
        return { outcome: 'failed' };
      }
    },
  });
}
