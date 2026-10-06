/**
 * What the orchestrator needs to know about one object (a leave-by, a meet-up, a flight leg, a
 * poll) to put it on lock screens: who should see it, whether it should be showing now, its
 * static attributes, its shared ContentState for a given content version, and how urgent a
 * change is. One loader per kind reads the object inside the orchestrator's transaction.
 */
import type { LaAlert, LaCopy, LaKind, LaPriority } from '@cp/domain';
import type pg from 'pg';

export type LaCopyVars = Readonly<Record<string, string | number>>;

/** An alert before rendering: copy plus its variables, rendered in each device's language. */
export interface LaAlertCopy {
  readonly title: LaCopy;
  readonly body: LaCopy;
  readonly vars: LaCopyVars;
  readonly sound?: boolean;
}

export interface LaUrgency {
  readonly priority: LaPriority;
  readonly alert?: LaAlertCopy;
}

export interface LaSnapshot {
  readonly tripId: string | null;
  /** Activities should be on lock screens now; false ends every one. */
  readonly live: boolean;
  /** Users who get the activity. */
  readonly audience: readonly string[];
  /**
   * Users the server may push-start it for; absent = the whole audience. An SOS sender starts
   * their own activity on the phone, so the server only keeps it updated.
   */
  readonly startAudience?: readonly string[];
  /**
   * Users who started the object themselves (set the alarm, added the flight, started the
   * meet-up, sent the SOS): on Android only they and `optedIn` get a Live Update, everyone else a
   * notification with the same content (Play allows Live Updates only for what the user began).
   */
  readonly initiators?: readonly string[];
  /** Users who opted into someone else's object (tapped ON MY WAY on a meet-up). */
  readonly optedIn?: readonly string[];
  /**
   * Users the server may start it for on Android; absent = `startAudience`. An SOS sender's
   * Android phone does not start its own, so the server does.
   */
  readonly androidStartAudience?: readonly string[];
  /** The static attributes for a push-to-start (rendered in the device's language). */
  readonly attributes: (locale: string) => Promise<Record<string, unknown>>;
  /** The shared ContentState at content version `seq`. */
  readonly state: (seq: number) => Record<string, unknown>;
  readonly startAlert: LaAlertCopy;
  /** When the activity is planned to end (the lifecycle sweep ends it then). */
  readonly endsAt: Date | null;
  /** How long an ended activity's final frame stays on the lock screen. */
  readonly lingerMs: number;
  /** Priority (and alert) of moving from `prev` to `next`. */
  readonly urgency: (
    prev: Record<string, unknown> | null,
    next: Record<string, unknown>,
  ) => LaUrgency;
}

export interface LaLoadContext {
  readonly tx: pg.PoolClient;
  readonly refId: string;
  readonly now: Date;
  readonly render: LaRender;
  /**
   * Someone the activity reaches hides details on the lock screen: the shared frames, attributes
   * and alerts name no exact place (the render already swaps in the lock-screen templates).
   */
  readonly redact?: boolean;
}

export type LaLoader = (ctx: LaLoadContext) => Promise<LaSnapshot | null>;

export type LaLoaders = Partial<Record<LaKind, LaLoader>>;

export type LaRender = (locale: string, copy: LaCopy, vars?: LaCopyVars) => Promise<string>;

export const ROUTINE: LaUrgency = { priority: 5 };

/** "03:10" in the object's zone. */
export function clockIn(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

export async function renderAlert(
  render: LaRender,
  locale: string,
  alert: LaAlertCopy,
): Promise<LaAlert> {
  const [title, body] = await Promise.all([
    render(locale, alert.title, alert.vars),
    render(locale, alert.body, alert.vars),
  ]);
  return { title, body, ...(alert.sound === true ? { sound: true } : {}) };
}
