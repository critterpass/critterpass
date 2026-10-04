/**
 * "FROM YOUR CLIPBOARD" (7d-1): the copied link with its platform, the post's own title (from the
 * preview route; undesigned before a guide summary exists) and ADD FROM IT. On iOS, before
 * anything is read, the card holds the system paste control instead (undesigned; no paste alert).
 */
import { t } from '@lingui/core/macro';
import * as Clipboard from 'expo-clipboard';
import { View } from 'react-native';

import { makeStyles, MIN_TOUCH_TARGET, Text, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';

import type { ClipboardLink, LinkPlatform } from './clipboard';
import type { ClipboardCardState } from './use-clipboard-link';

const GLYPHS: Readonly<Record<LinkPlatform, string>> = {
  tiktok: '♪',
  youtube: '▶',
  instagram: '◎',
  google_maps: '⌖',
  apple_maps: '⌖',
};

const PASTE_WIDTH = 120;

const useStyles = makeStyles((th) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
  glyph: {
    width: 46,
    height: 46,
    borderRadius: th.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.semantic.bg.sunken,
  },
  body: { flex: 1, minWidth: 0, gap: th.space['2'] },
  paste: { width: PASTE_WIDTH, height: MIN_TOUCH_TARGET },
}));

export interface ClipboardCardProps {
  readonly state: ClipboardCardState;
  readonly onAdd: (link: ClipboardLink) => void;
  readonly onPasted: (text: string) => void;
  /** Lab and tests: show the paste variant without the native control. */
  readonly pasteControl?: boolean;
}

export function ClipboardCard({ state, onAdd, onPasted, pasteControl = true }: ClipboardCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  if (state.kind === 'none') return null;
  const eyebrow = t({ id: 'search.clipboard.eyebrow', message: 'From your clipboard' });
  if (state.kind === 'paste') {
    return (
      <View style={styles.card} testID="search-clipboard-paste">
        <View style={styles.body}>
          <Text variant="eyebrow" color={theme.semantic.action.primary}>
            {eyebrow}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {t({
              id: 'search.clipboard.pasteLine',
              message: 'Paste the link to add its places.',
            })}
          </Text>
        </View>
        {pasteControl && Clipboard.isPasteButtonAvailable ? (
          <Clipboard.ClipboardPasteButton
            acceptedContentTypes={['url', 'plain-text']}
            displayMode="iconAndLabel"
            style={styles.paste}
            onPress={(data) => {
              if (data.type === 'text') onPasted(data.text);
            }}
          />
        ) : null}
      </View>
    );
  }
  const { link, preview } = state;
  return (
    <View style={styles.card} testID="search-clipboard-card">
      <View style={styles.glyph} accessibilityElementsHidden importantForAccessibility="no">
        <Text variant="h3">{GLYPHS[link.platform]}</Text>
      </View>
      <View style={styles.body}>
        <Text variant="eyebrow" color={theme.semantic.action.primary}>
          {eyebrow}
        </Text>
        <Text variant="monoData" numberOfLines={1}>
          {link.display}
        </Text>
        {preview?.title === null || preview === null ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={2}>
            {preview.title}
          </Text>
        )}
      </View>
      <PillButton
        label={t({ id: 'search.clipboard.add', message: 'Add from it' })}
        size="sm"
        onPress={() => onAdd(link)}
        testID="search-clipboard-add"
      />
    </View>
  );
}
