import { guideSticker } from '@/ui/avatar/guides';
import { type GuideId } from '@/ui/people/GuideLine';

export function guideName(guide: GuideId): string {
  return guideSticker(guide).name;
}
