/**
 * Decides whether a link preview request is a person opening the link, so unfurls never count as
 * opens. Builds on the shared unfurl-bot list (../abuse/bot-filter.ts) with what only link opens
 * need: HEAD probes, browser prefetch/prerender hints, and the extra preview fetchers (iMessage's
 * own fetcher, search and social previewers) that request invite links right after they are shared.
 */
import { defaultBotFilterConfig, isBotRequest, type BotFilterConfig } from '../abuse/bot-filter';

const LINK_PREVIEW_FETCHERS: readonly string[] = [
  'facebot',
  'applebot',
  'imessage',
  'googlebot',
  'google-pagerenderer',
  'bingbot',
  'bingpreview',
  'embedly',
  'pinterest',
  'redditbot',
  'snapchat',
  'bytespider',
  'yandex',
  'duckduckbot',
  'mastodon',
  'bot/',
  'crawler',
  'spider',
  'preview',
  'headlesschrome',
];

export function linkBotFilterConfig(): BotFilterConfig {
  const base = defaultBotFilterConfig();
  return {
    userAgentSubstrings: [...base.userAgentSubstrings, ...LINK_PREVIEW_FETCHERS],
    blockedIps: base.blockedIps,
  };
}

export interface LinkOpenRequest {
  readonly method: string;
  readonly userAgent: string | undefined;
  readonly ip: string | undefined;
  /** `Sec-Purpose` / `Purpose` / `X-Purpose` / `X-Moz` request hints, if any. */
  readonly purpose: string | undefined;
}

const PREFETCH_PURPOSE = /prefetch|prerender|preview/i;

export function isHumanLinkOpen(
  request: LinkOpenRequest,
  config: BotFilterConfig = linkBotFilterConfig(),
): boolean {
  if (request.method.toUpperCase() !== 'GET') return false;
  if (request.userAgent === undefined || request.userAgent.trim() === '') return false;
  if (request.purpose !== undefined && PREFETCH_PURPOSE.test(request.purpose)) return false;
  return !isBotRequest({ userAgent: request.userAgent, ip: request.ip }, config);
}
