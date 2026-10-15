/**
 * The guides the onboarding pages draw by name (Tokek speaks on every page, Pon on a few), as plain
 * facts for the premium pages: their display name and sticker kind.
 */
import { guideSticker } from '@/ui/premium/stickers/guides';

export interface GuideFacts {
  readonly name: string;
  readonly kind: string;
}

export function guideFacts(id: 'tokek' | 'pon'): GuideFacts {
  const info = guideSticker(id);
  return { name: info.name, kind: info.kind };
}

/** A trip's guide by its persona slug; an unknown or missing slug is Tokek. */
export function guideBySlug(slug: string | null): GuideFacts {
  const info = guideSticker(slug ?? 'tokek');
  return { name: info.name, kind: info.kind };
}
