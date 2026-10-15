import { guideSticker } from '@/ui/premium/stickers/guides';
import type { GuideId } from '@/lib/navigation/active-guide';

export function guideName(guide: GuideId): string {
  return guideSticker(guide).name;
}
