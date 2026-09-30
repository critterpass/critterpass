/**
 * Pexels photos and videos (https://www.pexels.com/api/documentation/). The Pexels licence allows
 * commercial use without attribution; the credit names the photographer and Pexels anyway, and the
 * ops console links every result back to Pexels as the API guidelines ask.
 */
import type { MediaCandidate } from '@cp/domain';

import { getJson, type SourceHttp } from './http';

export type SourceCandidate = Omit<MediaCandidate, 'subjects' | 'rank'>;

const LICENCE = { licence: 'pexels', licence_url: 'https://www.pexels.com/license/' } as const;

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt: string | null;
  src: { original: string; large: string };
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  url: string;
  image: string;
  duration: number;
  user: { name: string; url: string };
  video_files: { file_type: string; width: number | null; height: number | null; link: string }[];
}

export async function pexelsPhotos(
  http: SourceHttp,
  key: string,
  query: string,
  perPage: number,
): Promise<SourceCandidate[]> {
  const url = new URL('https://api.pexels.com/v1/search');
  url.search = new URLSearchParams({
    query,
    per_page: String(perPage),
    orientation: 'landscape',
  }).toString();
  const body = await getJson<{ photos: PexelsPhoto[] }>(http, url, {
    headers: { authorization: key },
  });
  return body.photos.map((p) => ({
    id: `pexels-photo-${p.id}`,
    kind: 'photo',
    source: 'pexels',
    source_id: String(p.id),
    source_url: p.url,
    download_url: p.src.original,
    preview_url: p.src.large,
    title: p.alt === null || p.alt === '' ? null : p.alt.slice(0, 300),
    author: p.photographer,
    author_url: p.photographer_url,
    ...LICENCE,
    attribution_required: false,
    credit: `Photo: ${p.photographer} · Pexels`,
    width: p.width,
    height: p.height,
    duration_ms: null,
  }));
}

/** The mp4 closest to 1920 wide without going over, else the smallest larger one. */
export function pickVideoFile<T extends { width: number | null }>(
  files: readonly T[],
  target = 1920,
): T | undefined {
  const sized = files.filter((f) => f.width !== null);
  const under = sized.filter((f) => (f.width ?? 0) <= target && (f.width ?? 0) >= 1280);
  if (under.length > 0) return under.reduce((a, b) => ((b.width ?? 0) > (a.width ?? 0) ? b : a));
  const over = sized.filter((f) => (f.width ?? 0) > target);
  return over.reduce<T | undefined>(
    (a, b) => (a === undefined || (b.width ?? 0) < (a.width ?? 0) ? b : a),
    undefined,
  );
}

export async function pexelsVideos(
  http: SourceHttp,
  key: string,
  query: string,
  perPage: number,
): Promise<SourceCandidate[]> {
  const url = new URL('https://api.pexels.com/videos/search');
  url.search = new URLSearchParams({
    query,
    per_page: String(perPage),
    orientation: 'landscape',
  }).toString();
  const body = await getJson<{ videos: PexelsVideo[] }>(http, url, {
    headers: { authorization: key },
  });
  return body.videos.flatMap((v) => {
    const file = pickVideoFile(v.video_files.filter((f) => f.file_type === 'video/mp4'));
    if (file === undefined || v.duration < 5) return [];
    return [
      {
        id: `pexels-video-${v.id}`,
        kind: 'video' as const,
        source: 'pexels' as const,
        source_id: String(v.id),
        source_url: v.url,
        download_url: file.link,
        preview_url: v.image,
        title: null,
        author: v.user.name,
        author_url: v.user.url,
        ...LICENCE,
        attribution_required: false,
        credit: `Video: ${v.user.name} · Pexels`,
        width: file.width ?? v.width,
        height: file.height ?? v.height,
        duration_ms: Math.round(v.duration * 1000),
      },
    ];
  });
}
