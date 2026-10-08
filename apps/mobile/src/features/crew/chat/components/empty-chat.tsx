/**
 * A brand-new crew's chat: the guide waves hello and the first message is one tap away ("Say hi to
 * the crew", the same line the "you're in" screen ends on). It sits in the middle of the space
 * above the composer and scrolls when the keyboard leaves it less room than it needs.
 */
import { t } from '@lingui/core/macro';
import { ScrollView } from 'react-native';

import { guideSticker, isGuideStickerId, type GuideStickerId } from '@/ui/avatar/guides';
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
  onInvite,
}: {
  readonly guideSlug: string | null;
  readonly guideName: string;
  readonly onSayHi: () => void;
  /** The crew is only this member so far: the way forward is to bring friends in. */
  readonly onInvite?: () => void;
}) {
  const styles = useStyles();
  const guide = guideIdOf(guideSlug);
  const sticker = guideSticker(guide);
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
        title={
          onInvite === undefined
            ? t({ id: 'chat.empty.title', message: 'Say hi to the crew' })
            : t({ id: 'chat.empty.loneTitle', message: 'It’s only you in here so far' })
        }
        line={
          onInvite === undefined
            ? t({
                id: 'chat.empty.line',
                message: 'Plans, photos and votes all land here. Start with a hello.',
              })
            : t({
                id: 'chat.empty.loneLine',
                message: 'Bring your friends in. Plans, photos and votes all land here.',
              })
        }
        action={
          onInvite === undefined
            ? { label: t({ id: 'chat.empty.action', message: 'Say hi' }), onPress: onSayHi }
            : {
                label: t({ id: 'chat.empty.invite', message: 'Invite friends' }),
                onPress: onInvite,
              }
        }
        testID={onInvite === undefined ? 'chat-empty' : 'chat-empty-invite'}
      />
    </ScrollView>
  );
}
