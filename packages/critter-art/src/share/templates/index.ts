import { renderCardNode } from '../backend-node';
import type { CardLayout } from '../model';
import {
  buildRecapAwards,
  buildRecapAwardsStory,
  recapAwardsAltText,
  recapAwardsPropsSchema,
} from './recap-awards';
import {
  buildRecapCover,
  buildRecapCoverStory,
  recapCoverAltText,
  recapCoverPropsSchema,
} from './recap-cover';
import {
  buildRecapMissed,
  buildRecapMissedStory,
  recapMissedAltText,
  recapMissedPropsSchema,
} from './recap-missed';
import {
  buildRecapReceipt,
  buildRecapReceiptStory,
  recapReceiptAltText,
  recapReceiptPropsSchema,
} from './recap-receipt';
import {
  buildRecapRoute,
  buildRecapRouteStory,
  recapRouteAltText,
  recapRoutePropsSchema,
} from './recap-route';
import {
  buildRecapStamp,
  buildRecapStampStory,
  recapStampAltText,
  recapStampPropsSchema,
} from './recap-stamp';
import {
  buildCritterCard,
  buildCritterCardStory,
  critterCardAltText,
  critterCardPropsSchema,
} from './critter-card';

/**
 * The templates that share one shape — a post (1080x1350) and a 9:16 story variant, both built
 * from the same props. `postcard` (front/back/print), `plan-preview` and `poster` (post only) and
 * `memory` (story only) don't fit that shape and are exported/used directly instead of through this
 * registry.
 */
const POST_STORY_TEMPLATES = {
  'critter-card': {
    schema: critterCardPropsSchema,
    build: buildCritterCard,
    buildStory: buildCritterCardStory,
    altText: critterCardAltText,
  },
  'recap-cover': {
    schema: recapCoverPropsSchema,
    build: buildRecapCover,
    buildStory: buildRecapCoverStory,
    altText: recapCoverAltText,
  },
  'recap-route': {
    schema: recapRoutePropsSchema,
    build: buildRecapRoute,
    buildStory: buildRecapRouteStory,
    altText: recapRouteAltText,
  },
  'recap-awards': {
    schema: recapAwardsPropsSchema,
    build: buildRecapAwards,
    buildStory: buildRecapAwardsStory,
    altText: recapAwardsAltText,
  },
  'recap-receipt': {
    schema: recapReceiptPropsSchema,
    build: buildRecapReceipt,
    buildStory: buildRecapReceiptStory,
    altText: recapReceiptAltText,
  },
  'recap-missed': {
    schema: recapMissedPropsSchema,
    build: buildRecapMissed,
    buildStory: buildRecapMissedStory,
    altText: recapMissedAltText,
  },
  'recap-stamp': {
    schema: recapStampPropsSchema,
    build: buildRecapStamp,
    buildStory: buildRecapStampStory,
    altText: recapStampAltText,
  },
} as const;

export type PostStoryTemplateId = keyof typeof POST_STORY_TEMPLATES;

export interface RenderShareCardOptions {
  readonly format?: 'post' | 'story';
}

/**
 * Validates `props` against `templateId`'s own zod schema, builds its layout (post by default,
 * `options.format: 'story'` for the 9:16 variant) and rasterizes it via the Node backend — the
 * entry point a worker's share-card job calls.
 */
export function renderShareCardNode<T extends PostStoryTemplateId>(
  templateId: T,
  props: unknown,
  options: RenderShareCardOptions = {},
): Promise<Uint8Array> {
  const entry = POST_STORY_TEMPLATES[templateId];
  const parsed = entry.schema.parse(props);
  const layout: CardLayout = options.format === 'story' ? callWithParsed(entry.buildStory, parsed) : callWithParsed(entry.build, parsed);
  return renderCardNode(layout);
}

/**
 * Each registry entry's `build`/`buildStory` accepts exactly its own `schema`'s inferred type — the
 * union-of-templates type `POST_STORY_TEMPLATES` produces can't express that per-key
 * correspondence to TypeScript's control-flow narrowing without a per-template overload, so this
 * one helper documents (rather than works around) that fact instead of hand-writing seven overloads.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see doc comment above
function callWithParsed(build: (props: any) => CardLayout, parsed: unknown): CardLayout {
   
  return build(parsed);
}

export function shareCardAltText<T extends PostStoryTemplateId>(
  templateId: T,
  props: unknown,
): string {
  const entry = POST_STORY_TEMPLATES[templateId];
  const parsed = entry.schema.parse(props);
  return callAltTextWithParsed(entry.altText, parsed);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see callWithParsed's doc comment
function callAltTextWithParsed(altText: (props: any) => string, parsed: unknown): string {
   
  return altText(parsed);
}

export * from './critter-card';
export * from './memory';
export * from './plan-preview';
export * from './postcard';
export * from './poster';
export * from './recap-awards';
export * from './recap-cover';
export * from './recap-missed';
export * from './recap-receipt';
export * from './recap-route';
export * from './recap-stamp';
export * from './story-frame';
