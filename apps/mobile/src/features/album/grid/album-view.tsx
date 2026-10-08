/**
 * The crew's album (3m-2): PHOTOS with "+ UPLOAD", BEST · n / ALL · n / BY PERSON, the guide's
 * line over its picks, day sections named after the plan's day, and a masonry of photos with the
 * uploader's chip, in a recycling list so an album of hundreds mounts only what is near the
 * screen. Never gated on payment. States the design leaves out are built from the same parts: an
 * empty album (no segments until there is a photo), uploads going up, waiting for a connection or
 * failed, duplicates skipped, the guide still choosing, and "download all" with its zip.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Segmented } from '@/ui/inputs/Segmented';
import { GuideLine, type GuideId } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { LargeTitle } from '@/ui/shell/LargeTitle';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';
import type { Href } from 'expo-router';

import {
  daySections,
  gridItems,
  openingSegment,
  personSections,
  segmentPhotos,
  type AlbumPerson,
  type AlbumPhoto,
  type AlbumSegment,
  type GridItem,
  type PlanDay,
} from '../data/album-model';
import type { AlbumExportState } from '../data/album-export';
import { dayLabel } from './album-copy';
import { MasonryRowView, type TilePerson } from './masonry';

export interface AlbumViewProps {
  readonly loaded: boolean;
  readonly photos: readonly AlbumPhoto[];
  readonly people: readonly AlbumPerson[];
  readonly tags: readonly { readonly photoId: string; readonly userId: string }[];
  readonly days: readonly PlanDay[];
  readonly guide: GuideId;
  readonly guideName: string;
  /** The guide's line over its picks; null until it has curated. */
  readonly curationNote: string | null;
  /** This device's uploads for the trip, over the grid. */
  readonly banner: ReactNode;
  readonly exportState: AlbumExportState;
  /** Where back goes when the album was opened cold (a link, a notice). */
  readonly backFallback: Href;
  /** Lab scenes open on a given segment; the album itself opens on the picks when it has any. */
  readonly initialSegment?: AlbumSegment;
  readonly onUpload: () => void;
  readonly onOpen: (photoId: string) => void;
  readonly onWho: (photoId: string) => void;
  readonly onDownloadAll: () => void;
}

const useStyles = makeStyles((t) => ({
  list: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'] },
  head: { gap: t.space['16'], paddingBottom: t.space['16'] },
  foot: { gap: t.space['16'], paddingTop: t.space['8'] },
  title: { paddingTop: t.space['8'], paddingBottom: t.space['10'] },
  state: { paddingHorizontal: t.size.gutter, gap: t.space['16'] },
}));

const keyOf = (item: GridItem) => item.key;
const typeOf = (item: GridItem) => item.kind;

export function AlbumView(props: AlbumViewProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const theme = useTheme();
  const { width: screen } = useWindowDimensions();
  const width = screen - theme.size.gutter * 2;
  const { photos, people, tags, days, onOpen, onWho } = props;
  const picks = useMemo(() => photos.filter((photo) => photo.isPick).length, [photos]);
  const total = photos.length;
  // The traveller's choice wins; until then the album opens on the picks once it knows it has any.
  const [chosen, setChosen] = useState<AlbumSegment | null>(props.initialSegment ?? null);
  const [opening, setOpening] = useState<AlbumSegment | null>(null);
  const first = openingSegment(props.loaded, picks);
  if (opening === null && first !== null) setOpening(first);
  const segment = chosen ?? opening ?? first ?? 'all';

  const formerName = t({ id: 'album.formerTraveller', message: 'A former traveller' });
  const tilePeople = useMemo(() => {
    const map = new Map<string, TilePerson>();
    people.forEach((person, index) => map.set(person.id, { name: person.name, index }));
    return map;
  }, [people]);

  const items = useMemo(() => {
    if (segment === 'people') {
      return gridItems(
        personSections(photos, people, tags).map((section) => ({
          key: section.person.id,
          title: section.person.name || formerName,
          photos: section.photos,
        })),
      );
    }
    return gridItems(
      daySections(segmentPhotos(photos, segment), days).map((section) => ({
        key: section.key,
        title: dayLabel(section, locale),
        photos: section.photos,
      })),
    );
  }, [segment, photos, people, tags, days, locale, formerName]);

  const renderItem = useCallback(
    ({ item }: { item: GridItem }) =>
      item.kind === 'header' ? (
        <View style={styles.title}>
          <Text variant="eyebrow">{item.title}</Text>
        </View>
      ) : (
        <MasonryRowView
          row={item.row}
          start={item.start}
          width={width}
          people={tilePeople}
          formerName={formerName}
          onOpen={onOpen}
          onWho={onWho}
        />
      ),
    [styles.title, width, tilePeople, formerName, onOpen, onWho],
  );

  const header = (
    <LargeTitle
      title={t({ id: 'album.title', message: 'Photos' })}
      start={
        <BackEyebrow
          label={t({ id: 'album.back', message: 'Trip' })}
          fallback={props.backFallback}
        />
      }
      end={
        <PillButton
          label={t({ id: 'album.upload', message: '+ Upload' })}
          onPress={props.onUpload}
          tone="cream"
          size="sm"
          testID="album-upload"
        />
      }
    />
  );

  if (!props.loaded || total === 0) {
    return (
      <Scaffold variant="dark" edges={['top']} testID="album-screen">
        {header}
        <View style={styles.state}>
          {props.banner}
          {!props.loaded ? (
            <Skeleton preset="list" testID="album-loading" />
          ) : (
            <EmptyState
              guide={props.guide}
              guideName={props.guideName}
              sticker={
                <Sticker
                  kind={guideSticker(props.guide).kind}
                  name={props.guideName}
                  pose="sleep"
                  size={120}
                />
              }
              title={t({ id: 'album.empty.title', message: 'No photos yet' })}
              line={t({
                id: 'album.empty.line',
                message:
                  "Add the trip's photos and the whole crew sees them. Photos only, no videos. Free, always.",
              })}
              action={{
                label: t({ id: 'album.empty.add', message: 'Add photos' }),
                onPress: props.onUpload,
              }}
              testID="album-empty"
            />
          )}
        </View>
      </Scaffold>
    );
  }

  const exportLabel =
    props.exportState === 'asking' || props.exportState === 'zipping'
      ? t({ id: 'album.export.asking', message: 'Zipping the album…' })
      : props.exportState === 'ready'
        ? t({ id: 'album.export.open', message: 'Your zip is ready. Download it' })
        : props.exportState === 'failed'
          ? t({ id: 'album.export.failed', message: "Couldn't zip it. Try again" })
          : t({ id: 'album.export', message: 'Download all' });

  return (
    <Scaffold variant="dark" edges={['top']} testID="album-screen">
      {header}
      <FlashList
        data={items}
        keyExtractor={keyOf}
        getItemType={typeOf}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        testID="album-list"
        ListHeaderComponent={
          <View style={styles.head}>
            <Segmented<AlbumSegment>
              testID="album-segments"
              label={t({ id: 'album.segments', message: 'Show' })}
              value={segment}
              onChange={setChosen}
              segments={[
                {
                  value: 'best',
                  label: upper(t({ id: 'album.best', message: `Best · ${picks}` }), locale),
                },
                {
                  value: 'all',
                  label: upper(t({ id: 'album.all', message: `All · ${total}` }), locale),
                },
                {
                  value: 'people',
                  label: upper(t({ id: 'album.byPerson', message: 'By person' }), locale),
                },
              ]}
            />
            {props.banner}
            {segment === 'best' || props.curationNote === null ? (
              <GuideLine
                guide={props.guide}
                name={props.guideName}
                line={
                  props.curationNote ??
                  t({
                    id: 'album.curating',
                    message: "I'm going through the photos. My picks land here soon.",
                  })
                }
                testID={props.curationNote === null ? 'album-curating' : 'album-curation-note'}
              />
            ) : null}
          </View>
        }
        ListFooterComponent={
          <View style={styles.foot}>
            {segment === 'people' && tags.length === 0 ? (
              <Text variant="body" singleLine={false} testID="album-people-empty">
                {t({
                  id: 'album.people.none',
                  message: "Nobody's tagged yet. Open a photo and tap “I'm in this”.",
                })}
              </Text>
            ) : null}
            <TextLink
              label={exportLabel}
              onPress={props.onDownloadAll}
              disabled={props.exportState === 'asking' || props.exportState === 'zipping'}
              testID="album-download-all"
            />
          </View>
        }
      />
    </Scaffold>
  );
}
