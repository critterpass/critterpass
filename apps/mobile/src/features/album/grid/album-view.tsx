/**
 * The crew's album (3m-2): PHOTOS with "+ UPLOAD", BEST · n / ALL · n / BY PERSON, the guide's
 * line over its picks, day sections named after the plan's day, and a masonry of photos with the
 * uploader's chip. Never gated on payment. States the design leaves out are built from the same
 * parts: an empty album, uploads going up, waiting for a connection or failed, duplicates skipped,
 * the guide still choosing, and "download all".
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Segmented } from '@/ui/inputs/Segmented';
import { GuideLine, type GuideId } from '@/ui/people/GuideLine';
import { LargeTitle } from '@/ui/shell/LargeTitle';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import {
  daySections,
  personSections,
  segmentPhotos,
  type AlbumPerson,
  type AlbumPhoto,
  type AlbumSegment,
  type PlanDay,
} from '../data/album-model';
import { dayLabel, uploadBanner, type UploadCounts } from './album-copy';
import { Masonry } from './masonry';

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
  readonly uploads: UploadCounts;
  readonly exportState: 'idle' | 'asking' | 'ready' | 'failed';
  readonly initialSegment?: AlbumSegment;
  readonly onUpload: () => void;
  readonly onRetryUploads: () => void;
  readonly onOpen: (photoId: string) => void;
  readonly onWho: (photoId: string) => void;
  readonly onDownloadAll: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['16'] },
  section: { gap: t.space['10'] },
  banner: {
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.raised,
    padding: t.space['12'],
    gap: t.space['4'],
  },
}));

export function AlbumView(props: AlbumViewProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const picks = props.photos.filter((photo) => photo.isPick).length;
  const total = props.photos.length;
  const [segment, setSegment] = useState<AlbumSegment>(
    props.initialSegment ?? (picks > 0 ? 'best' : 'all'),
  );
  const shown = segmentPhotos(props.photos, segment);
  const banner = uploadBanner(props.uploads);
  const indexOf = (uid: string) =>
    Math.max(
      0,
      props.people.findIndex((p) => p.id === uid),
    );
  const nameOf = (uid: string) =>
    props.people.find((p) => p.id === uid)?.name ||
    t({ id: 'album.formerTraveller', message: 'A former traveller' });

  const tiles = (photos: readonly AlbumPhoto[]) => (
    <Masonry
      photos={photos}
      nameOf={nameOf}
      indexOf={indexOf}
      onOpen={props.onOpen}
      onWho={props.onWho}
    />
  );

  return (
    <Scaffold variant="dark" edges={['top']} testID="album-screen">
      <LargeTitle
        title={t({ id: 'album.title', message: 'Photos' })}
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
      <ScrollView contentContainerStyle={styles.content}>
        <Segmented<AlbumSegment>
          testID="album-segments"
          label={t({ id: 'album.segments', message: 'Show' })}
          value={segment}
          onChange={setSegment}
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
        {banner === null ? null : (
          <View style={styles.banner} testID="album-upload-banner">
            <Text variant="body">{banner.line}</Text>
            {props.uploads.failed > 0 ? (
              <TextLink
                label={t({ id: 'album.upload.retry', message: 'Try the failed ones again' })}
                onPress={props.onRetryUploads}
                testID="album-upload-retry"
              />
            ) : null}
          </View>
        )}
        {!props.loaded ? (
          <Skeleton preset="list" testID="album-loading" />
        ) : props.photos.length === 0 ? (
          <EmptyState
            guide={props.guide}
            guideName={props.guideName}
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
        ) : (
          <>
            {segment === 'best' ? (
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
            {segment === 'people'
              ? personSections(props.photos, props.people, props.tags).map((section) => (
                  <View key={section.person.id} style={styles.section}>
                    <Text variant="eyebrow">{section.person.name}</Text>
                    {tiles(section.photos)}
                  </View>
                ))
              : daySections(shown, props.days).map((section) => (
                  <View key={section.key} style={styles.section}>
                    <Text variant="eyebrow">{dayLabel(section, locale)}</Text>
                    {tiles(section.photos)}
                  </View>
                ))}
            {segment === 'people' && props.tags.length === 0 ? (
              <Text variant="body" testID="album-people-empty">
                {t({
                  id: 'album.people.empty',
                  message: "Nobody's tagged yet. Hold a photo and tap “I'm in this”.",
                })}
              </Text>
            ) : null}
            <TextLink
              label={
                props.exportState === 'asking'
                  ? t({ id: 'album.export.asking', message: 'Zipping the album…' })
                  : props.exportState === 'ready'
                    ? t({ id: 'album.export.ready', message: 'Your zip is ready for 7 days' })
                    : props.exportState === 'failed'
                      ? t({ id: 'album.export.failed', message: "Couldn't zip it. Try again" })
                      : t({ id: 'album.export', message: 'Download all' })
              }
              onPress={props.onDownloadAll}
              testID="album-download-all"
            />
          </>
        )}
      </ScrollView>
    </Scaffold>
  );
}
