/** The sticker tray's empty tab: nothing met yet, or nothing sent yet. */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { CritterSticker, Text, makePremiumStyles } from '@/ui/premium';

const useStyles = makePremiumStyles((th) => ({
  empty: {
    alignItems: 'center',
    paddingHorizontal: th.space.gutter,
    paddingTop: th.space.titleGutter,
    gap: th.space.gap6,
  },
  emptyDisc: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.status.maybe.bg,
    marginBottom: th.space.gap6,
  },
}));

/** No stickers on this tab: the sleeping gecko in a small disc, what lands here and how. */
export function TrayEmpty({ met }: { readonly met: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.empty, { width: '100%' }]} testID="chat-tray-empty">
      <View style={styles.emptyDisc} accessible={false}>
        <CritterSticker kind="gecko" name="" size={64} pose="sleep" edge={false} />
      </View>
      <Text variant="headline" align="center">
        {met
          ? t({ id: 'chat.premium.tray.noRecentTitle', message: 'Nothing sent yet' })
          : t({ id: 'chat.premium.tray.noneTitle', message: 'No stickers yet' })}
      </Text>
      <Text variant="caption" tone="muted" align="center">
        {met
          ? t({ id: 'chat.premium.tray.noRecent', message: 'Stickers you send show up here.' })
          : t({
              id: 'chat.premium.tray.none',
              message: 'Meet a critter on a trip and its stickers land here.',
            })}
      </Text>
    </View>
  );
}
