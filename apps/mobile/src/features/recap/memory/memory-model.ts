/**
 * The year-later memory (3m-10) as the screen shows it: the moment it calls back (from the recap's
 * stats when this phone has them, else the guide's own line as the memory row stores it) and the
 * crew's reactions as chips. A reaction that arrives live replaces that traveller's synced one
 * (one reaction each); a line is its own chip, while bare emoji gather into one chip per emoji
 * with a count, led by whoever reacted with it first.
 */
/* eslint-disable lingui/no-unlocalized-strings -- kinds and keys, never copy. */
import type { RecapStats } from '@cp/domain';

export interface MemoryReactionRow {
  readonly user_id: string;
  readonly emoji: string | null;
  readonly text: string | null;
  /** `users.display_name`; empty or null once the account is gone. */
  readonly name: string | null;
  /** The member colour; null for someone no longer in the crew. */
  readonly colour: string | null;
}

export interface LiveReaction {
  readonly userId: string;
  readonly emoji: string | null;
  readonly text: string | null;
}

export interface MemoryReactionChip {
  readonly key: string;
  readonly userId: string;
  readonly name: string;
  readonly colour: string | null;
  readonly emoji: string | null;
  /** Travellers who reacted with this emoji (1 for a line). */
  readonly count: number;
  readonly text: string | null;
  readonly mine: boolean;
}

/** The moment the memory calls back, newest data first. */
export type MemoryMoment =
  | { readonly kind: 'sunrise'; readonly time: string; readonly name: string }
  | { readonly kind: 'best_day'; readonly dayNo: number; readonly days: number }
  | { readonly kind: 'trip'; readonly days: number; readonly travellers: number }
  | { readonly kind: 'written'; readonly text: string };

export function memoryMoment(stats: RecapStats | null, written: string): MemoryMoment {
  if (stats === null) return { kind: 'written', text: written };
  const best = stats.best_day;
  const sunrise =
    stats.superlatives.find((s) => best !== null && s.local_date === best.local_date) ??
    stats.superlatives[0];
  if (sunrise !== undefined) {
    return { kind: 'sunrise', time: sunrise.local_time, name: sunrise.name };
  }
  if (best !== null) return { kind: 'best_day', dayNo: best.day_no, days: stats.days };
  return { kind: 'trip', days: stats.days, travellers: stats.travellers };
}

export function reactionChips(
  rows: readonly MemoryReactionRow[],
  live: readonly LiveReaction[],
  viewerId: string | null,
): MemoryReactionChip[] {
  const people = new Map(rows.map((row) => [row.user_id, row]));
  const latest = new Map<string, { emoji: string | null; text: string | null }>();
  for (const row of rows) latest.set(row.user_id, { emoji: row.emoji, text: row.text });
  for (const reaction of live) {
    latest.delete(reaction.userId);
    latest.set(reaction.userId, { emoji: reaction.emoji, text: reaction.text });
  }

  const chips: MemoryReactionChip[] = [];
  const byEmoji = new Map<string, number>();
  for (const [userId, reaction] of latest) {
    const person = people.get(userId);
    const base = {
      userId,
      name: person?.name ?? '',
      colour: person?.colour ?? null,
      mine: userId === viewerId,
    };
    const text = reaction.text?.trim() ?? '';
    if (text !== '') {
      chips.push({ ...base, key: `text:${userId}`, emoji: reaction.emoji, count: 1, text });
      continue;
    }
    const emoji = reaction.emoji;
    if (emoji === null || emoji === '') continue;
    const at = byEmoji.get(emoji);
    if (at === undefined) {
      byEmoji.set(emoji, chips.length);
      chips.push({ ...base, key: `emoji:${emoji}`, emoji, count: 1, text: null });
    } else {
      const chip = chips[at];
      if (chip !== undefined)
        chips[at] = { ...chip, count: chip.count + 1, mine: chip.mine || base.mine };
    }
  }
  return chips;
}
