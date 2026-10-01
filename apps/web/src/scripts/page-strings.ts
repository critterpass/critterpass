/**
 * The copy the page's scripts print after load, rendered by the server in the page's language
 * and handed over in the `cs-config` JSON block: the scripts themselves hold no words. Patterns
 * keep their `{placeholders}`, filled in the browser with {@link fill}.
 */
export interface PageStrings {
  readonly typedLine: string;
  readonly note: string;
  readonly emailInvalid: string;
  readonly rateLimited: string;
  readonly joinFailed: string;
  readonly ticketWaitlist: string;
  readonly ticketConfirmed: string;
  readonly navJoin: string;
  /** `{position}` */
  readonly navJoined: string;
  readonly finalJoin: string;
  readonly finalShare: string;
  /** `{name}`, `{place}` */
  readonly savingSeat: string;
  readonly shareTitle: string;
  /** `{url}` */
  readonly shareText: string;
  readonly copied: string;
  /** `{days}`, `{hours}`, `{minutes}`, `{seconds}` */
  readonly countdown: string;
  readonly boardingNow: string;
  /** The egg's hint after zero, one and two taps. */
  readonly eggHints: readonly [string, string, string];
  /** `{num}`, `{city}` */
  readonly hatchedNumber: string;
  /** Who hatched, one sentence per critter id. */
  readonly hatchLines: Readonly<Record<string, string>>;
}

export function fill(pattern: string, values: Readonly<Record<string, string | number>>): string {
  return pattern.replace(/\{(\w+)\}/gu, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}
