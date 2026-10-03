/**
 * The album curation routes' shapes: the guide's look at the candidate thumbnails (route
 * `photo.picks`, vision) scores each photo 0–10 for how good and how much of a moment it is; its
 * note (route `micro.line`) is one line from the facts code computed about the picks.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

/** At most this many thumbnails go to the guide in one curation run (cost bound). */
export const ALBUM_SCORE_MAX_PHOTOS = 60;
export const ALBUM_NOTE_MAX = 140;

export const albumScoreReplySchema = z.object({
  scores: z.array(z.object({ photo_id: z.string(), score: z.number() })),
});
export type AlbumScoreReply = z.infer<typeof albumScoreReplySchema>;

export const ALBUM_SCORE_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['scores'],
    properties: {
      scores: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['photo_id', 'score'],
          properties: { photo_id: { type: 'string' }, score: { type: 'number' } },
        },
      },
    },
  },
};

export interface AlbumThumbnail {
  readonly photo_id: string;
  readonly media_type: 'image/jpeg';
  readonly base64: string;
}
