/**
 * The quest template registry: each template's code-owned definition (params, bounds, target) and
 * the matcher that reads one event and says what it counts for a quest. The generator offers the
 * guide exactly what is registered when it runs, and `quest.evaluate` runs for every event type a
 * registered template consumes. Features register at module load, next to their events.
 */
import {
  BUILTIN_QUEST_TEMPLATES,
  templateMap,
  type QuestTemplateDef,
  type QuestTemplateMap,
} from '@cp/domain';
import type pg from 'pg';

/** A live quest as the evaluator sees it. */
export interface QuestRow {
  readonly id: string;
  readonly trip_id: string;
  readonly template: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly target: number;
  readonly starts_at: Date;
  /** 00:00 of the quest day on the trip's clock. */
  readonly day_start: Date;
  /** The template's deadline on the quest day, or the end of that day. */
  readonly ends_at: Date;
}

/** A consumed domain event. */
export interface QuestEvent {
  readonly id: string;
  readonly type: string;
  readonly trip_id: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurred_at: Date;
}

export interface QuestMatchInput {
  readonly tx: pg.PoolClient;
  readonly quest: QuestRow;
  readonly event: QuestEvent;
  /** Travellers whose actions count for this quest (the crew, or those who signed up). */
  readonly audience: ReadonlySet<string>;
}

/**
 * What the event counts for, as a key: progress is the number of distinct keys (a place, a
 * traveller, an expense), so the same thing counted twice moves nothing. `complete` finishes the
 * quest outright (the crew settled; a co-presence spawn granted). `null`: nothing to count.
 */
export type QuestMatchResult = { readonly key: string } | { readonly complete: true } | null;

export type QuestMatcher = (input: QuestMatchInput) => Promise<QuestMatchResult>;

export interface QuestTemplateRegistration<P> extends QuestTemplateDef<P> {
  readonly match: QuestMatcher;
}

const registry = new Map<string, QuestTemplateRegistration<never>>();

export function registerQuestTemplate<P>(template: QuestTemplateRegistration<P>): void {
  if (registry.has(template.id)) throw new Error(`quest template ${template.id} is registered`);
  registry.set(template.id, template as unknown as QuestTemplateRegistration<never>);
}

/** The registered definitions, as the validator and the generator take them. */
export function registeredQuestTemplates(): QuestTemplateMap {
  return templateMap([...registry.values()]);
}

export function questMatcher(templateId: string): QuestMatcher | undefined {
  return registry.get(templateId)?.match;
}

export function questConsumes(templateId: string, eventType: string): boolean {
  return registry.get(templateId)?.consumes.includes(eventType) ?? false;
}

/** Every event type some registered template consumes. */
export function consumedQuestEvents(): ReadonlySet<string> {
  return new Set([...registry.values()].flatMap((template) => template.consumes));
}

/** The built-in definitions, each with its matcher (the matchers live beside the evaluator). */
export function registerBuiltinQuestTemplates(
  matchers: Readonly<Record<string, QuestMatcher>>,
): void {
  for (const def of BUILTIN_QUEST_TEMPLATES) {
    if (registry.has(def.id)) continue;
    const match = matchers[def.id];
    if (match === undefined) throw new Error(`quest template ${def.id} has no matcher`);
    registerQuestTemplate({ ...def, match });
  }
}
