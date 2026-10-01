/**
 * The crew quests screen (3l-7) and its hub tile as plain data, from synced rows: the crew's level
 * and XP bar, and one card per quest of the trip's day in slot order with its colour, progress
 * (pips, or faces for an all-hands quest), reward and state. Counts, targets and rewards are the
 * server's; nothing here decides progress.
 */
import { crewLevel, toLocalWallTime, type CrewLevel } from '@cp/domain';

export interface QuestRow {
  readonly id: string;
  readonly local_date: string;
  readonly slot: number;
  readonly template: string;
  readonly params: string | null;
  readonly target: number;
  readonly reward: string | null;
  readonly title: string;
  readonly body: string;
  readonly scope: string;
  readonly status: string;
  readonly ends_at: string;
  readonly reveal_at: string | null;
}

export interface ProgressRow {
  readonly quest_id: string;
  readonly value: number;
  readonly counted: string | null;
}

export interface QuestMember {
  readonly userId: string;
  readonly name: string;
  readonly joinIndex: number;
}

export type QuestColour = 'yellow' | 'pink' | 'green' | 'blue';
export type QuestIcon = 'sun' | 'pin' | 'food' | 'wallet' | 'egg' | 'star' | 'critter';
export type QuestState = 'active' | 'done' | 'missed';

export interface QuestReward {
  readonly xp: number;
  readonly kind: 'xp' | 'critter' | 'settled';
}

export interface QuestCardModel {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly colour: QuestColour;
  readonly icon: QuestIcon;
  readonly state: QuestState;
  readonly reward: QuestReward;
  /** Pips; null for an all-hands quest, which shows faces instead. */
  readonly progress: { readonly done: number; readonly total: number } | null;
  readonly people: readonly (QuestMember & { readonly done: boolean })[] | null;
  readonly optional: boolean;
  readonly signedUp: boolean;
  readonly revealAt: string | null;
}

export type QuestsScreenState = 'loading' | 'before' | 'writing' | 'over' | 'ready';

export interface QuestsModel {
  readonly state: QuestsScreenState;
  readonly level: CrewLevel;
  readonly localDate: string;
  readonly cards: readonly QuestCardModel[];
  /** Quests still to finish today (the hub tile's "3 LIVE"). */
  readonly live: number;
}

const COLOURS: readonly QuestColour[] = ['yellow', 'pink', 'green', 'blue'];

function json<T>(text: string | null, fallback: T): T {
  if (text === null || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function rewardOf(row: QuestRow): QuestReward {
  const reward = json<{ xp?: number; sticker?: string | null; form_id?: string | null }>(
    row.reward,
    {},
  );
  const xp = typeof reward.xp === 'number' ? reward.xp : 0;
  if (reward.sticker === 'settled') return { xp, kind: 'settled' };
  if (typeof reward.form_id === 'string') return { xp, kind: 'critter' };
  return { xp, kind: 'xp' };
}

function iconOf(row: QuestRow, reward: QuestReward): QuestIcon {
  if (reward.kind === 'critter') return 'critter';
  switch (row.template) {
    case 'early_start':
      return 'sun';
    case 'visit_poi':
    case 'visit_any_of':
      return 'pin';
    case 'log_expenses':
      return json<{ category?: string }>(row.params, {}).category === 'food' ? 'food' : 'wallet';
    case 'befriend':
      return 'egg';
    case 'settle_by':
      return 'wallet';
    default:
      return 'star';
  }
}

function stateOf(row: QuestRow, now: Date): QuestState {
  if (row.status === 'completed') return 'done';
  if (row.status === 'expired' || row.status === 'failed') return 'missed';
  return Date.parse(row.ends_at) <= now.getTime() ? 'missed' : 'active';
}

export interface QuestsInput {
  readonly loaded: boolean;
  readonly trip: {
    readonly startDate: string | null;
    readonly endDate: string | null;
    readonly tz: string;
  } | null;
  readonly crewXp: number;
  readonly quests: readonly QuestRow[];
  readonly progress: readonly ProgressRow[];
  readonly signups: readonly { readonly quest_id: string; readonly user_id: string }[];
  readonly members: readonly QuestMember[];
  readonly viewerId: string | null;
  readonly now: Date;
}

export function buildQuestsModel(input: QuestsInput): QuestsModel {
  const level = crewLevel(input.crewXp);
  const tz = input.trip?.tz ?? 'UTC';
  const localDate = toLocalWallTime(input.now, tz).date;
  const empty = (state: QuestsScreenState): QuestsModel => ({
    state,
    level,
    localDate,
    cards: [],
    live: 0,
  });
  if (!input.loaded || input.trip === null) return empty('loading');
  const today = input.quests.filter((quest) => quest.local_date === localDate);
  if (today.length === 0) {
    const { startDate, endDate } = input.trip;
    if (startDate === null || localDate < startDate) return empty('before');
    if (endDate !== null && localDate > endDate) return empty('over');
    return empty('writing');
  }
  const progress = new Map(input.progress.map((row) => [row.quest_id, row]));
  const cards = [...today]
    .sort((a, b) => a.slot - b.slot)
    .map((row, index): QuestCardModel => {
      const reward = rewardOf(row);
      const state = stateOf(row, input.now);
      const moved = progress.get(row.id);
      const done = state === 'done' ? row.target : Math.min(moved?.value ?? 0, row.target);
      const counted = new Set(json<string[]>(moved?.counted ?? null, []));
      const allHands = row.template === 'copresence';
      const signedUp = input.signups.some(
        (signup) => signup.quest_id === row.id && signup.user_id === input.viewerId,
      );
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        colour: COLOURS[index % COLOURS.length] ?? 'yellow',
        icon: iconOf(row, reward),
        state,
        reward,
        progress: allHands ? null : { done, total: row.target },
        people: allHands
          ? input.members.map((member) => ({
              ...member,
              done: state === 'done' || counted.has(member.userId),
            }))
          : null,
        optional: row.scope === 'optional',
        signedUp,
        revealAt: row.reveal_at,
      };
    });
  return {
    state: 'ready',
    level,
    localDate,
    cards,
    live: cards.filter((card) => card.state === 'active').length,
  };
}
