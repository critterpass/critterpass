/**
 * Bot-filtered opens: classifies link-preview/prefetch crawlers and known scanner IPs so invite-open
 * counting does not count a messaging app's own unfurl fetch as a real open. Config-driven (no
 * hard-coded provider list beyond the well-known messaging-app unfurl bots, which are stable,
 * publicly documented user agents, not a private allow/deny list that changes often) so ops can
 * extend either list without a code change once invite-open counting wires this in.
 */
export interface BotFilterConfig {
  /** Case-insensitive substrings checked against the User-Agent header. */
  readonly userAgentSubstrings: readonly string[];
  /** Exact IP matches (a CIDR allow-list can be added once real scanner ranges are known to block). */
  readonly blockedIps: readonly string[];
}

/**
 * Well-known link-preview/unfurl bots messaging and social apps run when a link is shared — none of
 * these represent a human opening the link. Not exhaustive; `BotFilterConfig.userAgentSubstrings`
 * extends this list without a code change.
 */
const KNOWN_UNFURL_USER_AGENT_SUBSTRINGS: readonly string[] = [
  'whatsapp',
  'facebookexternalhit',
  'telegrambot',
  'twitterbot',
  'slackbot',
  'discordbot',
  'linkedinbot',
  'skypeuripreview',
  'viberbot',
];

export function defaultBotFilterConfig(): BotFilterConfig {
  return { userAgentSubstrings: KNOWN_UNFURL_USER_AGENT_SUBSTRINGS, blockedIps: [] };
}

export interface BotFilterRequest {
  readonly userAgent: string | undefined;
  readonly ip: string | undefined;
}

/** True when the request looks like an automated link-preview fetch or a known scanner, not a human open. */
export function isBotRequest(
  request: BotFilterRequest,
  config: BotFilterConfig = defaultBotFilterConfig(),
): boolean {
  if (request.ip && config.blockedIps.includes(request.ip)) return true;
  if (!request.userAgent) return false;
  const lowerUserAgent = request.userAgent.toLowerCase();
  return config.userAgentSubstrings.some((substring) =>
    lowerUserAgent.includes(substring.toLowerCase()),
  );
}
