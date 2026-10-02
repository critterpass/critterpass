/**
 * A brand-new crew's chat: the guide waves hello and the first message is one tap away ("Say hi to
 * the crew", the same line the "you're in" screen ends on). It sits in the middle of the space
 * above the composer and scrolls when the keyboard leaves it less room than it needs.
 */
import { t } from '@lingui/core/macro';
import { ScrollView } from 'react-native';

import { GUIDE_STICKERS, isGuideStickerId, type GuideStickerId } from '@/ui/avatar/guides';
import { EmptyState } from '@/ui/states/EmptyState';
import { Sticker } from '@/ui/sticker/Sticker';
import { makeStyles } from '@/ui/theme';

const GUIDE_SIZE = 120;

const useStyles = makeStyles(() => ({
  content: { flexGrow: 1, justifyContent: 'center' },
}));

/** A known guide id for the slug, else Tokek (the default companion). */
export function guideIdOf(slug: string | null | undefined): GuideStickerId {
  return isGuideStickerId(slug) ? slug : 'tokek';
}

export function EmptyChat({
  guideSlug,
  guideName,
  onSayHi,
}: {
  readonly guideSlug: string | null;
  readonly guideName: string;
  readonly onSayHi: () => void;
}) {
  const styles = useStyles();
  const guide = guideIdOf(guideSlug);
  const sticker = GUIDE_STICKERS[guide];
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <EmptyState
        guide={guide}
        guideName={guideName}
        sticker={<Sticker kind={sticker.kind} name={sticker.name} pose="wave" size={GUIDE_SIZE} />}
        title={t({ id: 'chat.empty.title', message: 'Say hi to the crew' })}
        line={t({
          id: 'chat.empty.line',
          message: 'Plans, photos and votes all land here. Start with a hello.',
        })}
        action={{ label: t({ id: 'chat.empty.action', message: 'Say hi' }), onPress: onSayHi }}
        testID="chat-empty"
      />
    </ScrollView>
  );
}
