/**
 * The crew level curve and the XP each source is worth. Early levels come quickly (400 XP for level
 * 2, then 100 more per level) and from level 7 every level takes 1,000 XP; every even level unlocks
 * a crew sticker. The database mirrors the curve in `app.crew_level` so a grant stores its level in
 * the same transaction; a database test holds the two to the same table.
 */

/** XP from level `level` to the next one. */
export function xpForNextLevel(level: number): number {
  return 100 * Math.min(10, Math.max(1, level) + 3);
}

/** Highest level a crew can reach; far beyond any real crew, it keeps loops bounded. */
export const MAX_CREW_LEVEL = 999;

export interface CrewLevel {
  readonly level: number;
  /** XP earned inside the current level. */
  readonly into: number;
  /** XP the current level takes in all (the bar's denominator). */
  readonly need: number;
  /** The next level that unlocks a crew sticker. */
  readonly nextStickerLevel: number;
}

export function isStickerLevel(level: number): boolean {
  return level >= 2 && level % 2 === 0;
}

export function crewLevel(totalXp: number): CrewLevel {
  let level = 1;
  let floor = 0;
  const xp = Math.max(0, Math.floor(totalXp));
  while (level < MAX_CREW_LEVEL && xp >= floor + xpForNextLevel(level)) {
    floor += xpForNextLevel(level);
    level += 1;
  }
  const next = level + 1;
  return {
    level,
    into: xp - floor,
    need: xpForNextLevel(level),
    nextStickerLevel: isStickerLevel(next) ? next : next + 1,
  };
}

/** Sticker levels crossed going from `before` to `after` (both inclusive of `after`). */
export function stickerLevelsBetween(before: number, after: number): number[] {
  const levels: number[] = [];
  for (let level = before + 1; level <= after; level += 1) {
    if (isStickerLevel(level)) levels.push(level);
  }
  return levels;
}

/** XP per non-quest source (quest XP comes from each template's table). */
export const XP_SOURCES = {
  /** A traveller's first visit to a place on a trip. */
  visit: 10,
  /** The crew settling a trip to zero (every member and the crew). */
  settle: 150,
} as const;

export const XP_SOURCE_KINDS = ['quest', 'form', 'visit', 'settle'] as const;
export type XpSourceKind = (typeof XP_SOURCE_KINDS)[number];
