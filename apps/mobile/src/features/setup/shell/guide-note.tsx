/** The trip guide's voice line on a setup step: their sticker and a Caveat line in their colour. */
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { GuideLine } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';

const STICKER_PT = 44;

export function guideName(guide: GuideId): string {
  return GUIDE_STICKERS[guide].name;
}

export function GuideNote({
  guide,
  line,
  bubble = false,
  testID,
}: {
  readonly guide: GuideId;
  readonly line: string;
  readonly bubble?: boolean;
  readonly testID?: string;
}) {
  const info = GUIDE_STICKERS[guide];
  return (
    <GuideLine
      guide={guide}
      name={info.name}
      line={line}
      bubble={bubble}
      sticker={<Sticker kind={info.kind} name={info.name} size={STICKER_PT} />}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
