/**
 * Matchers of the built-in quest templates: each reads one consumed event and says what it counts
 * for a quest (a key; progress is the number of distinct keys) or that it finishes the quest. Only
 * travellers in the quest's audience count, and only inside the quest day, up to its deadline.
 * Visits are read here as the server (their POI and time never leave this job).
 */
import type { QuestMatcher, QuestMatchInput } from './registry';

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

interface VisitRow {
  readonly user_id: string;
  readonly poi_id: string;
  readonly arrived_at: Date;
}

async function visitOf(input: QuestMatchInput): Promise<VisitRow | null> {
  const id = str(input.event.payload['visit_id']);
  if (id === null) return null;
  const { rows } = await input.tx.query<VisitRow>(
    'SELECT user_id, poi_id, arrived_at FROM visits WHERE id = $1 AND trip_id = $2',
    [id, input.quest.trip_id],
  );
  const visit = rows[0];
  if (visit === undefined || !input.audience.has(visit.user_id)) return null;
  const at = visit.arrived_at.getTime();
  const inDay = at >= input.quest.day_start.getTime() && at <= input.quest.ends_at.getTime();
  return inDay ? visit : null;
}

const visitPoi: QuestMatcher = async (input) => {
  const visit = await visitOf(input);
  return visit !== null && visit.poi_id === input.quest.params['poi_id']
    ? { key: 'visited' }
    : null;
};

const visitAnyOf: QuestMatcher = async (input) => {
  const visit = await visitOf(input);
  const places = input.quest.params['poi_ids'];
  if (visit === null || !Array.isArray(places) || !places.includes(visit.poi_id)) return null;
  return { key: visit.poi_id };
};

const copresence: QuestMatcher = async (input) => {
  const place = str(input.quest.params['poi_id']);
  if (input.event.type === 'copresence.completed') {
    const rule = str(input.event.payload['spawn_rule_id']);
    const { rows } = await input.tx.query(
      'SELECT 1 FROM spawn_rules WHERE id = $1 AND $2::uuid = ANY (poi_ids)',
      [rule, place],
    );
    const inTime = input.event.occurred_at.getTime() <= input.quest.ends_at.getTime();
    return rows.length > 0 && inTime ? { complete: true } : null;
  }
  const visit = await visitOf(input);
  return visit !== null && visit.poi_id === place ? { key: visit.user_id } : null;
};

const earlyStart: QuestMatcher = async (input) => {
  const visit = await visitOf(input);
  if (visit === null) return null;
  const { rows } = await input.tx.query(
    `SELECT 1 FROM plan_items i JOIN trips t ON t.current_version_id = i.version_id
      WHERE t.id = $1 AND i.stable_id = $2 AND i.poi_id = $3`,
    [input.quest.trip_id, str(input.quest.params['plan_item_id']), visit.poi_id],
  );
  return rows.length > 0 ? { key: 'early' } : null;
};

const logExpenses: QuestMatcher = async (input) => {
  const id = str(input.event.payload['expense_id']);
  const { rows } = await input.tx.query<{ created_by: string; category: string; created_at: Date }>(
    `SELECT created_by, category, created_at FROM expenses
      WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL AND source NOT IN ('booking', 'boost')`,
    [id, input.quest.trip_id],
  );
  const expense = rows[0];
  if (expense === undefined || id === null || !input.audience.has(expense.created_by)) return null;
  const category = input.quest.params['category'];
  if (typeof category === 'string' && expense.category !== category) return null;
  return expense.created_at.getTime() >= input.quest.day_start.getTime() ? { key: id } : null;
};

const befriend: QuestMatcher = async (input) => {
  const { payload } = input.event;
  const user = str(payload['user_id']);
  const entry = str(payload['entry_id']);
  // Hatching an egg is not befriending one.
  if (user === null || entry === null || payload['source'] === 'hatch') return null;
  if (payload['trip_id'] !== input.quest.trip_id || !input.audience.has(user)) return null;
  const set = str(input.quest.params['set']);
  if (set !== null) {
    const { rows } = await input.tx.query(
      `SELECT 1 FROM critters c JOIN critter_sets s ON s.id = c.set_id
        WHERE c.id = $1 AND s.code = $2`,
      [str(payload['critter_id']), set],
    );
    if (rows.length === 0) return null;
  }
  return { key: entry };
};

const settleBy: QuestMatcher = (input) =>
  Promise.resolve(
    input.event.occurred_at.getTime() <= input.quest.ends_at.getTime() ? { complete: true } : null,
  );

export const BUILTIN_QUEST_MATCHERS: Readonly<Record<string, QuestMatcher>> = {
  visit_poi: visitPoi,
  visit_any_of: visitAnyOf,
  copresence,
  early_start: earlyStart,
  log_expenses: logExpenses,
  befriend,
  settle_by: settleBy,
};
