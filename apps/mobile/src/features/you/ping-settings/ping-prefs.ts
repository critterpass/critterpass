/**
 * How much the app pings this person, as plain data: the synced `notification_prefs` row mapped
 * to what the screen shows, the product defaults while the row does not exist yet, and the patch
 * `set_notification_prefs` takes.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, command and column names, never copy. */
import { DEFAULT_BUDGET_PER_DAY } from '@cp/domain';

export const CREW_CHAT_MODES = ['all', 'mentions', 'off'] as const;
export type CrewChatMode = (typeof CREW_CHAT_MODES)[number];

export interface PingPrefs {
  /** BUDGET pings a day, 1–10; the rest waits for the roundup. */
  readonly budget: number;
  /** `HH:MM`, 24-hour. */
  readonly roundupTime: string;
  readonly quietFrom: string;
  readonly quietTo: string;
  readonly guideTips: boolean;
  readonly crewChat: CrewChatMode;
  readonly money: boolean;
  readonly crittersNearby: boolean;
}

export const BUDGET_MIN = 1;
export const BUDGET_MAX = 10;

export const DEFAULT_PING_PREFS: PingPrefs = {
  budget: DEFAULT_BUDGET_PER_DAY,
  roundupTime: '20:00',
  quietFrom: '22:00',
  quietTo: '07:00',
  guideTips: true,
  crewChat: 'all',
  money: true,
  crittersNearby: true,
};

export interface PingPrefsRow {
  readonly budget_per_day: number | null;
  readonly roundup_time: string | null;
  readonly quiet_from: string | null;
  readonly quiet_to: string | null;
  readonly guide_tips: number | null;
  readonly crew_chat_mode: string | null;
  readonly money: number | null;
  readonly critters_nearby: number | null;
}

export const PREFS_SQL = `SELECT budget_per_day, roundup_time, quiet_from, quiet_to, guide_tips,
  crew_chat_mode, money, critters_nearby FROM notification_prefs WHERE user_id = ?`;
export const PREFS_TABLES = ['notification_prefs'];

/** Postgres `time` syncs as `HH:MM:SS`; the screen and the command speak `HH:MM`. */
const clock = (value: string | null, fallback: string) =>
  value !== null && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : fallback;

const flag = (value: number | null, fallback: boolean) => (value === null ? fallback : value !== 0);

export function prefsFromRow(row: PingPrefsRow | undefined): PingPrefs {
  if (row === undefined) return DEFAULT_PING_PREFS;
  const d = DEFAULT_PING_PREFS;
  const mode = CREW_CHAT_MODES.find((candidate) => candidate === row.crew_chat_mode);
  return {
    budget: clampBudget(row.budget_per_day ?? d.budget),
    roundupTime: clock(row.roundup_time, d.roundupTime),
    quietFrom: clock(row.quiet_from, d.quietFrom),
    quietTo: clock(row.quiet_to, d.quietTo),
    guideTips: flag(row.guide_tips, d.guideTips),
    crewChat: mode ?? d.crewChat,
    money: flag(row.money, d.money),
    crittersNearby: flag(row.critters_nearby, d.crittersNearby),
  };
}

export function clampBudget(value: number): number {
  return Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, Math.round(value)));
}

/** The command's wire shape (services/api `set_notification_prefs`): only what changes is sent. */
export interface SetNotificationPrefsPayload {
  readonly budget?: number;
  readonly roundup_time?: string;
  readonly quiet?: { readonly from: string; readonly to: string };
  readonly guide_tips?: boolean;
  readonly crew_chat?: CrewChatMode;
  readonly money?: boolean;
  readonly critters_nearby?: boolean;
}

/** The patch for a change, given what is shown now (quiet hours always travel as a pair). */
export function payloadFor(
  change: Partial<PingPrefs>,
  current: PingPrefs,
): SetNotificationPrefsPayload {
  const quiet =
    change.quietFrom !== undefined || change.quietTo !== undefined
      ? {
          from: change.quietFrom ?? current.quietFrom,
          to: change.quietTo ?? current.quietTo,
        }
      : undefined;
  return {
    ...(change.budget !== undefined ? { budget: clampBudget(change.budget) } : {}),
    ...(change.roundupTime !== undefined ? { roundup_time: change.roundupTime } : {}),
    ...(quiet !== undefined ? { quiet } : {}),
    ...(change.guideTips !== undefined ? { guide_tips: change.guideTips } : {}),
    ...(change.crewChat !== undefined ? { crew_chat: change.crewChat } : {}),
    ...(change.money !== undefined ? { money: change.money } : {}),
    ...(change.crittersNearby !== undefined ? { critters_nearby: change.crittersNearby } : {}),
  };
}
