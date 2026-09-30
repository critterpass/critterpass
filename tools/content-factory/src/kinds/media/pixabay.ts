/**
 * Pixabay photos and videos (https://pixabay.com/api/docs/). The Content Licence allows commercial
 * use without attribution, but not permanent hotlinking: the ingest job downloads every file into
 * our own bucket. Without full API access the largest photo is 1280 px wide.
 */
import { getJson, type SourceHttp } from './http';
import { pickVideoFile, type SourceCandidate } from './pexels';

const LICENCE = {
  licence: 'pixabay',
  licence_url: 'https://pixabay.com/service/license-summary/',
} as const;

interface PixabayPhoto {
  id: number;
  pageURL: string;
  tags: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  user_id: number;
}

interface PixabayVideoFile {
  url: string;
  width: number;
  height: number;
  thumbnail: string;
}

interface PixabayVideo {
  id: number;
  pageURL: string;
  tags: string;
  duration: number;
  videos: Partial<Record<'large' | 'medium' | 'small' | 'tiny', PixabayVideoFile>>;
  user: string;
  user_id: number;
}

const LARGE_PX = 1280;

function userUrl(user: string, id: number): string {
  return `https://pixabay.com/users/${encodeURIComponent(user)}-${id}/`;
}

export async function pixabayPhotos(
  http: SourceHttp,
  key: string,
  query: string,
  perPage: number,
): Promise<SourceCandidate[]> {
  const url = new URL('https://pixabay.com/api/');
  url.search = new URLSearchParams({
    key,
    q: query,
    image_type: 'photo',
    orientation: 'horizontal',
    safesearch: 'true',
    min_width: '1600',
    per_page: String(Math.max(3, perPage)),
  }).toString();
  const body = await getJson<{ hits: PixabayPhoto[] }>(http, url, { redact: ['key'] });
  return body.hits.map((p) => {
    // largeImageURL is the original scaled to 1280 px on its long side.
    const scale = Math.min(1, LARGE_PX / Math.max(p.imageWidth, p.imageHeight));
    return {
      id: `pixabay-photo-${p.id}`,
      kind: 'photo',
      source: 'pixabay',
      source_id: String(p.id),
      source_url: p.pageURL,
      download_url: p.largeImageURL,
      preview_url: p.webformatURL,
      title: p.tags.slice(0, 300) || null,
      author: p.user,
      author_url: userUrl(p.user, p.user_id),
      ...LICENCE,
      attribution_required: false,
      credit: `Photo: ${p.user} · Pixabay`,
      width: Math.round(p.imageWidth * scale),
      height: Math.round(p.imageHeight * scale),
      duration_ms: null,
    };
  });
}

export async function pixabayVideos(
  http: SourceHttp,
  key: string,
  query: string,
  perPage: number,
): Promise<SourceCandidate[]> {
  const url = new URL('https://pixabay.com/api/videos/');
  url.search = new URLSearchParams({
    key,
    q: query,
    video_type: 'film',
    safesearch: 'true',
    min_width: '1280',
    per_page: String(Math.max(3, perPage)),
  }).toString();
  const body = await getJson<{ hits: PixabayVideo[] }>(http, url, { redact: ['key'] });
  return body.hits.flatMap((v) => {
    const files = Object.values(v.videos).filter(
      (f): f is PixabayVideoFile => f !== undefined && f.url !== '',
    );
    const file = pickVideoFile(files);
    const thumbnail = v.videos.medium?.thumbnail ?? files[0]?.thumbnail;
    if (file === undefined || thumbnail === undefined || v.duration < 5) return [];
    return [
      {
        id: `pixabay-video-${v.id}`,
        kind: 'video' as const,
        source: 'pixabay' as const,
        source_id: String(v.id),
        source_url: v.pageURL,
        download_url: file.url,
        preview_url: thumbnail,
        title: v.tags.slice(0, 300) || null,
        author: v.user,
        author_url: userUrl(v.user, v.user_id),
        ...LICENCE,
        attribution_required: false,
        credit: `Video: ${v.user} · Pixabay`,
        width: file.width,
        height: file.height,
        duration_ms: Math.round(v.duration * 1000),
      },
    ];
  });
}
