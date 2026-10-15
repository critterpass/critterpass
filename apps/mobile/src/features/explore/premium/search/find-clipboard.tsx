/**
 * The link you copied, on the empty Find (4.30): its thumb, "TIKTOK YOU COPIED", the post's title
 * and Add. On iOS, before anything is read, the card holds the kit's paste pill instead (nothing
 * read before a tap).
 */
import { t } from '@lingui/core/macro';
import { Image, View } from 'react-native';

import { Button, Card, PasteButton, Text, usePremiumTheme } from '@/ui/premium';

import type { ClipboardCardState } from '../../search/use-clipboard-link';
import { Doodle } from '../components/doodle';
import { Eyebrow } from '../components/labels';

/* eslint-disable lingui/no-unlocalized-strings -- brand names, never translated. */
const PLATFORM: Readonly<Record<string, string>> = {
  tiktok: 'TikTok',
  youtube: 'YouTube',
  instagram: 'Instagram',
  google_maps: 'Google Maps',
  apple_maps: 'Apple Maps',
};
/* eslint-enable lingui/no-unlocalized-strings */

const THUMB = 48;
const THUMB_DOODLE = 34;

export function FindClipboard(props: {
  readonly state: ClipboardCardState;
  readonly onAdd: (link: { readonly url: string }) => void;
  readonly onPasted: (text: string) => void;
}) {
  const theme = usePremiumTheme();
  const { state } = props;
  if (state.kind === 'none') return null;
  const row = { flexDirection: 'row', alignItems: 'center', gap: theme.space.gap12 } as const;
  if (state.kind === 'paste') {
    return (
      <Card style={[row, { padding: theme.space.gap12 }]} testID="search-clipboard-paste">
        <View style={{ flex: 1, gap: theme.space.gap4 / 2 }}>
          <Eyebrow text={t({ id: 'search.clipboard.eyebrow', message: 'From your clipboard' })} />
          <Text variant="caption" tone="muted">
            {t({ id: 'search.clipboard.pasteLine', message: 'Paste the link to add its places.' })}
          </Text>
        </View>
        <PasteButton
          label={t({ id: 'search.paste.paste', message: 'Paste' })}
          variant="primary"
          onPaste={props.onPasted}
          testID="search-clipboard-paste-button"
        />
      </Card>
    );
  }
  const { link, preview } = state;
  const platform = PLATFORM[link.platform] ?? '';
  return (
    <Card style={[row, { padding: theme.space.gap12 }]} testID="search-clipboard-card">
      <View
        style={{
          width: THUMB,
          height: THUMB,
          borderRadius: theme.radius.dayBadge,
          overflow: 'hidden',
          backgroundColor: theme.color.control,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {preview?.thumbUrl == null ? (
          <Doodle name="camera" size={THUMB_DOODLE} />
        ) : (
          <Image
            source={{ uri: preview.thumbUrl }}
            resizeMode="cover"
            style={{ width: THUMB, height: THUMB }}
          />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Eyebrow
          text={t({ id: 'explore.premium.find.copied', message: `${platform} you copied` })}
        />
        <Text variant="rowTextStrong" numberOfLines={1}>
          {preview?.title ?? link.display}
        </Text>
      </View>
      <Button
        label={t({ id: 'explore.premium.find.add', message: 'Add' })}
        size="small"
        onPress={() => props.onAdd(link)}
        testID="search-clipboard-add"
      />
    </Card>
  );
}
