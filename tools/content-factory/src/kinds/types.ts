/**
 * What each content kind plugs into the pipeline: its brief (the generation units, each one model
 * call keyed by the content hash of its input), its prompt, how outputs become release items, its
 * validators, an optional render stage and the founder gate its batches wait on.
 */
import type { ContentItem, ContentKind } from '@cp/content';
import type { z } from 'zod';

import type { Validators } from '../validators/registry';

export type ContentGate =
  | 'ip_signoff'
  | 'contact_sheets'
  | 'places_review'
  | 'window_sources'
  | 'persona_review'
  | 'native_review'
  | 'record_verification'
  | 'owner_approval';

export interface GenerationUnit {
  /** Stable id inside the batch (`cp-001`, `vi:greetings`). */
  readonly id: string;
  /** Everything the prompt is built from; its hash is the cache key. */
  readonly input: unknown;
}

export interface Prompt {
  readonly system: string;
  readonly user: string;
  /** Validates the model's JSON reply. */
  readonly schema: z.ZodType;
  /** JSON Schema sent with the request. */
  readonly jsonSchema: Record<string, unknown>;
}

export interface KindContext {
  readonly batchKey: string;
  readonly now: Date;
  /** Kind-specific options from the command line (`--set vn`, `--city bali`). */
  readonly options: Readonly<Record<string, string>>;
}

export interface Brief {
  readonly units: readonly GenerationUnit[];
  /** Reviewer notes from a rejected batch, by item ref (`*` = the whole batch), fed back into generation. */
  readonly notes?: Readonly<Record<string, string>>;
  /** The kind options the batch was briefed with; later stages reuse them. */
  readonly options?: Readonly<Record<string, string>>;
}

export interface RenderedItem {
  readonly ref: string;
  /** Path of the item's review image, relative to the batch work dir. */
  readonly file: string;
}

export interface KindModule<K extends ContentKind> {
  readonly kind: K;
  readonly title: (ctx: KindContext) => string;
  readonly gate: ContentGate;
  readonly brief: (ctx: KindContext) => Promise<Brief>;
  /** Absent for kinds built without a model (imported or structured from sources). */
  readonly prompt?: (unit: GenerationUnit, brief: Brief) => Prompt;
  /** Turns the brief and the parsed outputs (by unit id) into release items. */
  readonly assemble: (
    ctx: KindContext,
    brief: Brief,
    outputs: ReadonlyMap<string, unknown>,
  ) => Promise<readonly unknown[]>;
  readonly validators: Validators<K>;
  readonly render?: (
    ctx: KindContext,
    items: readonly ContentItem<K>[],
    outDir: string,
  ) => Promise<readonly RenderedItem[]>;
  /** Names the IP screen checks (critter and form names). */
  readonly ipNames?: (item: ContentItem<K>) => readonly string[];
  /** Why the batch cannot be approved yet even though it validates (e.g. awaiting native review). */
  readonly blockedReason?: (items: readonly ContentItem<K>[]) => string | null;
}

export type AnyKindModule = KindModule<ContentKind>;
