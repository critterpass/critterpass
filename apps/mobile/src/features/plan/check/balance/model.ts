/**
 * Balance the crew (7h-5), worked out on the phone from synced rows the crew can already see:
 * each member's must-do (ticked once it is in the plan) and how many of their saves made it into a
 * day, a place counted once however many times they saved it. For someone at zero, their saves
 * that fit well without moving anything are offered first (two at most). Only organisers get
 * anything back: nothing about balance is stored or sent anywhere.
 */
/* eslint-disable lingui/no-unlocalized-strings -- keys, never copy. */
import type { StoredFit } from '@cp/domain';

export interface BalanceMember {
  readonly uid: string;
  readonly name: string;
  readonly joinIndex: number;
}

export interface BalanceMustDo {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly poiId: string | null;
  readonly priority: number;
}

export interface BalanceItem {
  readonly poiId: string | null;
  readonly mustDoId: string | null;
}

export interface BalanceIdea {
  readonly id: string;
  readonly poiId: string | null;
  readonly name: string;
  readonly backerIds: readonly string[];
  readonly fit: StoredFit | null;
}

export interface FitSlot {
  readonly ideaId: string;
  readonly name: string;
  readonly poiId: string | null;
  readonly dayNo: number;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface MemberBalance {
  readonly uid: string;
  readonly name: string;
  readonly joinIndex: number;
  readonly you: boolean;
  readonly mustDo: { readonly title: string; readonly placed: boolean } | null;
  readonly saved: number;
  readonly placed: number;
  /** For someone at zero: their saves that fit without moving anything. */
  readonly fits: readonly FitSlot[];
  /** All of their saves not in the plan yet (the ask can name any of them). */
  readonly missedIdeaIds: readonly string[];
}

export interface Balance {
  readonly members: readonly MemberBalance[];
  readonly mustDosIn: boolean;
  readonly even: boolean;
}

export const MAX_OFFERED = 2;

const placeKey = (idea: BalanceIdea) => idea.poiId ?? `idea:${idea.id}`;

/** A good day that needs nothing moved, the best first. */
export function fitsAsIs(idea: BalanceIdea): FitSlot | null {
  const fit = idea.fit;
  if (fit === null) return null;
  const day = [...fit.days]
    .sort((a, b) => (a.day_no === fit.best?.day_no ? -1 : b.day_no === fit.best?.day_no ? 1 : 0))
    .find(
      (entry) =>
        entry.grade === 'good' && entry.slot !== null && (entry.needs_move ?? null) === null,
    );
  if (day?.slot == null) return null;
  return {
    ideaId: idea.id,
    name: idea.name,
    poiId: idea.poiId,
    dayNo: day.day_no,
    startsAt: day.slot.starts_at,
    endsAt: day.slot.ends_at,
  };
}

export function balanceOf(input: {
  readonly organiser: boolean;
  readonly me: string | null;
  readonly members: readonly BalanceMember[];
  readonly mustDos: readonly BalanceMustDo[];
  readonly items: readonly BalanceItem[];
  readonly ideas: readonly BalanceIdea[];
}): Balance | null {
  if (!input.organiser) return null;
  const inPlan = new Set(input.items.flatMap((item) => (item.poiId === null ? [] : [item.poiId])));
  const doneMustDos = new Set(
    input.items.flatMap((item) => (item.mustDoId === null ? [] : [item.mustDoId])),
  );
  const members = input.members.map((member): MemberBalance => {
    const mustDo = [...input.mustDos]
      .filter((entry) => entry.ownerId === member.uid)
      .sort((a, b) => a.priority - b.priority)[0];
    const mine = new Map<string, BalanceIdea>();
    for (const idea of input.ideas) {
      if (idea.backerIds.includes(member.uid) && !mine.has(placeKey(idea)))
        mine.set(placeKey(idea), idea);
    }
    const saves = [...mine.values()];
    const placed = saves.filter((idea) => idea.poiId !== null && inPlan.has(idea.poiId));
    const missed = saves.filter((idea) => !placed.includes(idea));
    return {
      uid: member.uid,
      name: member.name,
      joinIndex: member.joinIndex,
      you: member.uid === input.me,
      mustDo:
        mustDo === undefined
          ? null
          : {
              title: mustDo.title,
              placed:
                doneMustDos.has(mustDo.id) || (mustDo.poiId !== null && inPlan.has(mustDo.poiId)),
            },
      saved: saves.length,
      placed: placed.length,
      fits:
        saves.length > 0 && placed.length === 0
          ? missed
              .flatMap((idea) => {
                const slot = fitsAsIs(idea);
                return slot === null ? [] : [slot];
              })
              .slice(0, MAX_OFFERED)
          : [],
      missedIdeaIds: missed.map((idea) => idea.id),
    };
  });
  const shares = members
    .filter((member) => member.saved > 0)
    .map((member) => member.placed / member.saved);
  return {
    members,
    mustDosIn: members.every((member) => member.mustDo === null || member.mustDo.placed),
    even: shares.length === 0 || Math.max(...shares) - Math.min(...shares) < 0.34,
  };
}
