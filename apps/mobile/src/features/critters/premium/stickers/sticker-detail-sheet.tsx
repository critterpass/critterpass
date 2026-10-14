/**
 * A shelf sticker up close in the premium look (undesigned; built from the kit's sticker and the
 * premium sheet): the sticker with its crew level on a sun badge, its name, how it was earned and
 * the place and date. While the rows load the sheet holds a skeleton; an id this phone does not
 * have says so. Closing (✕, the scrim, a drag down) goes back.
 */
import { useLingui } from '@lingui/react/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PremiumSheet } from '@/features/album';
import { useLocale } from '@/lib/i18n/use-locale';
import { CritterSticker, LoadingCritter, Skeleton, Text, usePremiumTheme } from '@/ui/premium';

import { guideArt } from '../../stickers/sticker-art';
import { stickerHow, stickerName } from '../../stickers/sticker-copy';
import type { ShelfItem } from '../../stickers/sticker-model';
import { useStickers } from '../../stickers/use-stickers';

const ART = 140;

function StickerBody({ item }: { readonly item: ShelfItem }) {
  const th = usePremiumTheme();
  const locale = useLocale();
  const { t, i18n } = useLingui();
  const art = guideArt(item.guide);
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(item.grantedAt));
  const where =
    item.place === ''
      ? date
      : t({ id: 'stickers.detail.when', message: `${item.place} · ${date}` });
  return (
    <View style={styles.body}>
      <View>
        <CritterSticker
          kind={art.kind}
          name={art.name}
          size={ART}
          pose={item.kind === 'special' ? 'wave' : 'cheer'}
        />
        {item.kind === 'crew_level' && item.level !== null ? (
          <View style={[styles.badge, { backgroundColor: th.accent.sun }]}>
            <Text variant="avatarInitialLarge" tone="onAccent">
              {String(item.level)}
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="rowText" align="center" singleLine={false} testID="sticker-detail-how">
        {stickerHow(i18n, item)}
      </Text>
      <Text variant="mono" tone="muted" testID="sticker-detail-when">
        {where}
      </Text>
    </View>
  );
}

export function PremiumStickerDetailSheet() {
  const { stickerId } = useLocalSearchParams<{ stickerId: string }>();
  const { items, loaded } = useStickers();
  const { t, i18n } = useLingui();
  const item = items.find((candidate) => candidate.id === stickerId);
  const close = () => router.back();
  if (item !== undefined) {
    return (
      <PremiumSheet title={stickerName(i18n, item)} onClose={close} testID="sticker-detail">
        <StickerBody item={item} />
      </PremiumSheet>
    );
  }
  return (
    <PremiumSheet
      title={
        loaded
          ? t({ id: 'stickers.detail.missingTitle', message: 'This sticker isn’t here' })
          : t({ id: 'stickers.detail.loadingTitle', message: 'Finding the sticker…' })
      }
      onClose={close}
      testID={loaded ? 'sticker-detail-missing' : 'sticker-detail-loading'}
    >
      {loaded ? (
        <Text variant="rowText" tone="muted" singleLine={false}>
          {t({
            id: 'stickers.detail.missingLine',
            message: 'It may have been removed, or this phone hasn’t got it yet.',
          })}
        </Text>
      ) : (
        <View style={styles.waiting}>
          <Skeleton height={ART} tone="block" radius={22} />
          <LoadingCritter
            label={t({ id: 'stickers.detail.loadingTitle', message: 'Finding the sticker…' })}
          />
        </View>
      )}
    </PremiumSheet>
  );
}

const styles = StyleSheet.create({
  waiting: { gap: 12 },
  body: { alignItems: 'center', gap: 10, paddingBottom: 8 },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 4,
    minWidth: 30,
    height: 30,
    paddingHorizontal: 6,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
