import { GuideLine } from '@/ui/people/GuideLine';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';

/** Tokek's scripted line under the onboarding pages, in his voice colour. */
export function TokekSays({ line, testID }: { readonly line: string; readonly testID?: string }) {
  const tokek = GUIDE_STICKERS.tokek;
  return (
    <GuideLine
      guide="tokek"
      name={tokek.name}
      line={line}
      sticker={<Sticker kind={tokek.kind} name={tokek.name} size={44} />}
      {...(testID ? { testID } : {})}
    />
  );
}
