/** The guide avatar a thread draws: the trip guide's own sticker id. */
import { isGuideStickerId, type GuideStickerId } from '@/ui/premium/stickers/guides';

export function guideAvatarId(slug: string): GuideStickerId {
  return isGuideStickerId(slug) ? slug : 'tokek';
}
