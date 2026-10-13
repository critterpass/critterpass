/**
 * The trip journal (8.12), the crew's album as one pocket per day: the title with the ink `+` to
 * add photos, Best / All / By person, the guide's note on its picks on glass, the upload banner,
 * the pockets two by two, and Download all at the foot. Empty, loading and "no picks yet" states
 * keep the guide's voice.
 */
import { t } from '@lingui/core/macro';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { crewAccent } from '@/features/crew';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { guideSticker } from '@/ui/avatar/guides';
import {
  Button,
  CritterSticker,
  EmptyState,
  GlassIconButton,
  GlassSurface,
  IconButton,
  SegmentedControl,
  Skeleton,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';

import {
  daySections,
  openingSegment,
  personSections,
  segmentPhotos,
  type AlbumSegment,
} from '../data/album-model';
import { dayLabel } from '../grid/album-copy';
import type { AlbumViewProps } from '../grid/album-screen';
import { DayPocket, type Pocket } from './day-pocket';

const STICKERS = ['star', 'heart', 'pin', 'camera', 'food', 'boat'] as const;

function exportLabel(state: AlbumViewProps['exportState']): string {
  if (state === 'asking' || state === 'zipping') {
    return t({ id: 'album.export.asking', message: 'Zipping the album…' });
  }
  if (state === 'ready')
    return t({ id: 'album.export.open', message: 'Your zip is ready. Download it' });
  if (state === 'failed')
    return t({ id: 'album.export.failed', message: "Couldn't zip it. Try again" });
  return t({ id: 'album.export', message: 'Download all' });
}

export function PremiumJournalScene(props: AlbumViewProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { photos, people, tags, days } = props;
  const picks = photos.filter((photo) => photo.isPick).length;
  const [chosen, setChosen] = useState<AlbumSegment | null>(props.initialSegment ?? null);
  const segment = chosen ?? openingSegment(props.loaded, picks) ?? 'all';
  const art = guideSticker(props.guide);
  const formerName = t({ id: 'album.formerTraveller', message: 'A former traveller' });

  const pockets = useMemo<Pocket[]>(() => {
    const faceOf = (uid: string) => {
      const index = people.findIndex((person) => person.id === uid);
      const person = people[index];
      return {
        id: uid,
        name: person?.name || formerName,
        color: crewAccent(person?.colour, index),
      };
    };
    const facesOf = (list: Pocket['photos']) =>
      [...new Set(list.map((photo) => photo.uploaderId))].map(faceOf);
    if (segment === 'people') {
      return personSections(photos, people, tags).map((section) => {
        const name = section.person.name || formerName;
        return {
          key: section.person.id,
          title: name,
          tag: name,
          photos: section.photos,
          faces: [faceOf(section.person.id)],
        };
      });
    }
    return daySections(segmentPhotos(photos, segment), days).map((section) => {
      const title = dayLabel(section, locale);
      return {
        key: section.key,
        title,
        tag:
          section.dayNo === null
            ? title
            : t({ id: 'album.premium.day.number', message: `Day ${section.dayNo}` }),
        photos: section.photos,
        faces: facesOf(section.photos),
      };
    });
  }, [segment, photos, people, tags, days, locale, formerName]);

  const head = (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <GlassIconButton
          icon="back"
          label={t({ id: 'album.back', message: 'Trip' })}
          onPress={() => goBackOr(props.backFallback)}
          testID="album-back"
        />
        <IconButton
          icon="plus"
          tone="ink"
          label={t({ id: 'album.upload', message: '+ Upload' })}
          onPress={props.onUpload}
          testID="album-upload"
        />
      </View>
      <Text variant="largeTitle" accessibilityRole="header">
        {t({ id: 'album.premium.title', message: 'Trip journal' })}
      </Text>
      {photos.length === 0 ? null : (
        <SegmentedControl
          options={[
            { value: 'best', label: t({ id: 'album.best', message: `Best · ${picks}` }) },
            {
              value: 'all',
              label: t({ id: 'album.premium.all', message: `All · ${photos.length}` }),
            },
            { value: 'people', label: t({ id: 'album.byPerson', message: 'By person' }) },
          ]}
          value={segment}
          onChange={setChosen}
          accessibilityLabel={t({ id: 'album.segments', message: 'Show' })}
          testID="album-segments"
        />
      )}
      {props.curationNote === null && !(segment === 'best' && picks === 0) ? null : (
        <View style={{ borderRadius: 22, overflow: 'hidden' }}>
          <GlassSurface kind="regular" style={StyleSheet.absoluteFill} />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 8,
              paddingRight: 14,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'flex-end',
                backgroundColor: th.color.status.maybe.bg,
              }}
            >
              <CritterSticker
                kind={art.kind}
                name={props.guideName}
                size={34}
                pose="point"
                edge={false}
              />
            </View>
            <Text variant="rowText" tone="inkSecondary" style={{ flex: 1 }}>
              {props.curationNote ??
                t({
                  id: 'album.curating',
                  message: "I'm going through the photos. My picks land here soon.",
                })}
            </Text>
          </View>
        </View>
      )}
      {props.banner}
    </View>
  );

  let body;
  if (!props.loaded) {
    body = (
      <View style={{ flexDirection: 'row', gap: 12 }} testID="album-loading">
        <Skeleton height={150} radius={22} style={{ flex: 1 }} />
        <Skeleton height={150} radius={22} style={{ flex: 1 }} />
      </View>
    );
  } else if (photos.length === 0) {
    body = (
      <EmptyState
        critter={{ kind: art.kind, name: props.guideName }}
        title={t({ id: 'album.empty.title', message: 'No photos yet' })}
        line={t({
          id: 'album.empty.line',
          message:
            "Add the trip's photos and the whole crew sees them. Photos only, no videos. Free, always.",
        })}
        action={
          <Button
            size="medium"
            label={t({ id: 'album.empty.add', message: 'Add photos' })}
            onPress={props.onUpload}
          />
        }
        testID="album-empty"
      />
    );
  } else if (pockets.length === 0 && segment === 'people') {
    body = (
      <Text variant="body" tone="muted" testID="album-people-none">
        {t({
          id: 'album.people.none',
          message: "Nobody's tagged yet. Open a photo and tap “I'm in this”.",
        })}
      </Text>
    );
  } else {
    const rows: Pocket[][] = [];
    for (let i = 0; i < pockets.length; i += 2) rows.push(pockets.slice(i, i + 2));
    body = (
      <View style={{ gap: 22 }} testID="album-pockets">
        {rows.map((row) => (
          <View key={row.map((p) => p.key).join()} style={{ flexDirection: 'row', gap: 12 }}>
            {row.map((pocket, index) => (
              <DayPocket
                key={pocket.key}
                pocket={pocket}
                stickerKind={
                  STICKERS[(pockets.indexOf(pocket) + index) % STICKERS.length] ?? 'star'
                }
                onOpen={props.onOpen}
              />
            ))}
            {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))}
        <View style={{ alignItems: 'center' }}>
          <TextButton
            label={exportLabel(props.exportState)}
            onPress={props.onDownloadAll}
            testID="album-export"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: th.color.ground }} testID="album-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 6,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 32,
          gap: 18,
        }}
      >
        {head}
        {body}
      </ScrollView>
    </View>
  );
}
