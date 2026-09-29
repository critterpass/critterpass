/**
 * The window options the setup step shows (3c-3, 3c-4). The crew aims at the destination's season
 * peak when it has one (windows scoring at least `peakScore`), else at the whole horizon. When a
 * window there fits the whole crew, it is the one option. When none does, up to three: the best
 * partial window there (who misses it and which must-dos they would miss), the best full-crew
 * window anywhere in the horizon with its fare difference and season trade-off, and "ask first"
 * when the partial window's only blocker has nothing but `maybe` days there that they let the
 * guide ask about. The guide's pick is deterministic.
 */
import { compareWindows, scoreWindows, type ScoredWindow, type WindowInput } from './windows';

export type WindowOptionKind = 'best' | 'partial' | 'full_crew' | 'ask_first';

/** Reason keys the app's LLM-free templates render. */
export type WindowReason =
  'season_peak' | 'full_crew' | 'fare_drop' | 'season_trade' | 'partial_crew' | 'maybe_block';

export interface MustDoWindowRef {
  readonly id: string;
  readonly ownerId: string;
  /** Dates it can happen on (open days, event dates); `null` = any day. */
  readonly dates: ReadonlySet<string> | null;
}

export interface WindowOptionsInput extends WindowInput {
  readonly mustDos?: readonly MustDoWindowRef[];
  /** A season score from which a window counts as the season's peak (default 80). */
  readonly peakScore?: number;
}

export interface WindowOption {
  readonly position: number;
  readonly kind: WindowOptionKind;
  readonly start: string;
  readonly end: string;
  readonly freeCount: number;
  readonly memberCount: number;
  readonly missingMemberIds: readonly string[];
  readonly missedMustDoIds: readonly string[];
  readonly askUserId: string | null;
  /** This window's crew fare minus the best partial's; `null` when either is unknown. */
  readonly priceDeltaMinor: bigint | null;
  readonly seasonScore: number;
  readonly reason: WindowReason;
  readonly isPick: boolean;
}

/** Must-dos (of other members) that fall only on days a missing member cannot make. */
function missedMustDos(window: ScoredWindow, mustDos: readonly MustDoWindowRef[]): string[] {
  const missed = new Set<string>();
  for (const [uid, blocked] of window.blocking) {
    const away = new Set(blocked);
    for (const mustDo of mustDos) {
      if (mustDo.ownerId === uid || mustDo.dates === null) continue;
      const inWindow = [...mustDo.dates].filter((d) => d >= window.start && d <= window.end);
      if (inWindow.length > 0 && inWindow.every((d) => away.has(d))) missed.add(mustDo.id);
    }
  }
  return [...missed].sort();
}

/** The only blocker, when every day blocking them is an askable `maybe`. */
function askTarget(window: ScoredWindow, input: WindowInput): string | null {
  if (window.missing.length !== 1) return null;
  const uid = window.missing[0] as string;
  const member = input.members.find((m) => m.uid === uid);
  const blocked = window.blocking.get(uid) ?? [];
  const onlyMaybe = blocked.every(
    (d) => member?.days.get(d) === 'maybe' && (member.askable?.has(d) ?? false),
  );
  return member && blocked.length > 0 && onlyMaybe ? uid : null;
}

function delta(a: bigint | null, b: bigint | null): bigint | null {
  return a === null || b === null ? null : a - b;
}

function base(window: ScoredWindow) {
  return {
    start: window.start,
    end: window.end,
    freeCount: window.freeCount,
    memberCount: window.memberCount,
    missingMemberIds: window.missing,
    seasonScore: window.seasonScore,
  };
}

export function windowOptions(input: WindowOptionsInput): WindowOption[] {
  const windows = scoreWindows(input);
  const peak = input.peakScore ?? 80;
  const inSeason = input.seasonScore ? windows.filter((w) => w.seasonScore >= peak) : [];
  const best = (inSeason.length > 0 ? inSeason : windows)[0];
  if (best === undefined) return [];
  if (best.freeCount === best.memberCount) {
    return [
      {
        ...base(best),
        position: 0,
        kind: 'best',
        missedMustDoIds: [],
        askUserId: null,
        priceDeltaMinor: null,
        reason: best.seasonScore >= peak ? 'season_peak' : 'full_crew',
        isPick: true,
      },
    ];
  }

  const options: Omit<WindowOption, 'position' | 'isPick'>[] = [
    {
      ...base(best),
      kind: 'partial',
      missedMustDoIds: missedMustDos(best, input.mustDos ?? []),
      askUserId: null,
      priceDeltaMinor: null,
      reason: best.seasonScore >= peak ? 'season_peak' : 'partial_crew',
    },
  ];
  const full = windows
    .filter((w) => w.freeCount === w.memberCount)
    .sort((a, b) => compareWindows(a, b))[0];
  if (full !== undefined) {
    const priceDeltaMinor = delta(full.fare, best.fare);
    options.push({
      ...base(full),
      kind: 'full_crew',
      missedMustDoIds: [],
      askUserId: null,
      priceDeltaMinor,
      reason:
        full.seasonScore < best.seasonScore
          ? 'season_trade'
          : priceDeltaMinor !== null && priceDeltaMinor < 0n
            ? 'fare_drop'
            : 'full_crew',
    });
  }
  const ask = askTarget(best, input);
  if (ask !== null) {
    options.push({
      ...base(best),
      kind: 'ask_first',
      missedMustDoIds: [],
      askUserId: ask,
      priceDeltaMinor: null,
      reason: 'maybe_block',
    });
  }
  const pick =
    options.find((o) => o.kind === 'ask_first') ??
    (full !== undefined && full.seasonScore >= best.seasonScore
      ? options.find((o) => o.kind === 'full_crew')
      : undefined) ??
    options[0];
  return options.map((option, position) => ({ ...option, position, isPick: option === pick }));
}
