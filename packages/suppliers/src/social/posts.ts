/**
 * Post text from the platforms' public embeds, per the founder decision on links: TikTok oEmbed
 * (the caption is its `title`, plus author and thumbnail; no views or duration), YouTube oEmbed
 * plus the Data API's `videos.list` description when a key is set, and Instagram oEmbed only when
 * it returns caption text; otherwise the reader answers `needs_screenshot`. Nothing is kept.
 */
import { z } from 'zod';

import { getJson, type SocialFetch } from './http';

export type PostPlatform = 'tiktok' | 'youtube' | 'instagram';

export interface SocialPost {
  readonly platform: PostPlatform;
  readonly url: string;
  readonly title: string | null;
  readonly author: string | null;
  readonly thumbUrl: string | null;
  /** Caption or title + description: what the place extraction reads. */
  readonly text: string;
}

export type PostRead =
  | { readonly kind: 'post'; readonly post: SocialPost }
  | {
      readonly kind: 'needs_screenshot';
      readonly platform: PostPlatform;
      readonly title: string | null;
      readonly author: string | null;
      readonly thumbUrl: string | null;
    };

export interface PostReaderDeps {
  readonly fetch: SocialFetch;
  /** YouTube Data API key (`YOUTUBE_API_KEY`); without it only the oEmbed title is read. */
  readonly youtubeApiKey?: string | undefined;
  /** Meta app token for Instagram oEmbed; without it Instagram asks for a screenshot. */
  readonly instagramToken?: string | undefined;
}

const oembedSchema = z.object({
  title: z.string().optional(),
  author_name: z.string().optional(),
  thumbnail_url: z.string().optional(),
});

const videosSchema = z.object({
  items: z
    .array(z.object({ snippet: z.object({ description: z.string().optional() }).optional() }))
    .optional(),
});

const TITLE_MAX = 300;
const AUTHOR_MAX = 120;

const clean = (text: string | undefined, max: number): string | null => {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(0, max);
};

const httpsOrNull = (raw: string | undefined): string | null => {
  try {
    return raw !== undefined && new URL(raw).protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
};

const YOUTUBE_ID = /^[\w-]{11}$/u;

/** The 11-character id of a YouTube video link, or null. */
export function youtubeVideoId(url: URL): string | null {
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/u, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null;
  else if (url.pathname === '/watch') id = url.searchParams.get('v');
  else if (/^\/(shorts|embed|live)\//u.test(url.pathname)) id = url.pathname.split('/')[2] ?? null;
  return id !== null && YOUTUBE_ID.test(id) ? id : null;
}

export const OEMBED_URLS: Readonly<Record<PostPlatform, string>> = {
  tiktok: 'https://www.tiktok.com/oembed',
  youtube: 'https://www.youtube.com/oembed',
  instagram: 'https://graph.facebook.com/v22.0/instagram_oembed',
};

/** The platform's oEmbed answer for a post: title (TikTok's is the caption), author, thumbnail. */
export async function readOembed(
  platform: PostPlatform,
  url: URL,
  deps: PostReaderDeps,
): Promise<{ title: string | null; author: string | null; thumbUrl: string | null }> {
  const query = new URLSearchParams({ url: url.toString() });
  if (platform === 'youtube') query.set('format', 'json');
  if (platform === 'instagram') query.set('access_token', deps.instagramToken ?? '');
  const raw = oembedSchema.parse(
    await getJson(deps.fetch, `${OEMBED_URLS[platform]}?${query.toString()}`),
  );
  return {
    title: clean(raw.title, TITLE_MAX),
    author: clean(raw.author_name, AUTHOR_MAX),
    thumbUrl: httpsOrNull(raw.thumbnail_url),
  };
}

async function youtubeDescription(id: string, deps: PostReaderDeps): Promise<string | null> {
  if (deps.youtubeApiKey === undefined || deps.youtubeApiKey === '') return null;
  const query = new URLSearchParams({ part: 'snippet', id, key: deps.youtubeApiKey });
  const raw = videosSchema.parse(
    await getJson(deps.fetch, `https://www.googleapis.com/youtube/v3/videos?${query.toString()}`),
  );
  return clean(raw.items?.[0]?.snippet?.description, 5000);
}

export async function readPost(
  platform: PostPlatform,
  url: URL,
  deps: PostReaderDeps,
): Promise<PostRead> {
  if (platform === 'instagram' && (deps.instagramToken ?? '') === '') {
    return { kind: 'needs_screenshot', platform, title: null, author: null, thumbUrl: null };
  }
  const embed = await readOembed(platform, url, deps);
  if (platform === 'instagram' && embed.title === null) {
    return { kind: 'needs_screenshot', platform, ...embed };
  }
  let text = embed.title ?? '';
  if (platform === 'youtube') {
    const id = youtubeVideoId(url);
    const description = id === null ? null : await youtubeDescription(id, deps);
    text = [embed.title, description].filter((part) => part !== null).join('\n');
  }
  return { kind: 'post', post: { platform, url: url.toString(), ...embed, text } };
}
