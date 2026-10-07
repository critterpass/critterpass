/**
 * SHARE RECAP (an undesigned sheet): the format switch (story or post), the picture exactly as it
 * will be shared, drawn on the phone, and the actions as a plain list (share, save to Photos), so
 * another way to share slots in as one more row. The sheet's ✕ closes it.
 */
import type { DistanceUnit } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { feedback, toast } from '@/motion';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Segmented } from '@/ui/inputs/Segmented';
import { Stack } from '@/ui/layout/Stack';
import type { GuideId } from '@/ui/people/GuideLine';
import type { ShareFormat } from '@/ui/share-image/ShareImageSheet';
import {
  saveToPhotos,
  shareViaSystemSheet,
  type ShareActionsDeps,
} from '@/ui/share-image/share-actions';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { makeStyles, useTheme } from '@/ui/theme';

import { deviceShareDeps, renderRecapCard, SHARE_SIZE } from './share-card';
import { headerEyebrow, headerTitle, tileCopy } from './summary-copy';
import type { SummaryModel } from './summary-model';

// Short enough that the actions under it stay on a small phone's screen.
const PREVIEW_HEIGHT = 260;

const useStyles = makeStyles((th) => ({
  frame: {
    alignSelf: 'center',
    height: PREVIEW_HEIGHT,
    borderRadius: th.radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.semantic.bg.control,
    borderWidth: 1,
    borderColor: th.color.ink[600],
  },
  image: { width: '100%', height: '100%' },
  failed: { alignItems: 'center', gap: th.space['8'], padding: th.space['16'] },
}));

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

type Drawn =
  | { readonly status: 'drawing' }
  | { readonly status: 'ready'; readonly bytes: Uint8Array; readonly uri: string }
  | { readonly status: 'failed' };

export interface ShareSheetViewProps {
  readonly title: string;
  /** Read out for the preview and handed to the share sheet as its title. */
  readonly altText: string;
  /** Draws the picture in one format: what the preview shows is what is shared. */
  readonly render: (format: ShareFormat) => Promise<Uint8Array>;
  readonly deps: ShareActionsDeps;
  readonly onClose: () => void;
  /** More ways to share, listed under the two above. */
  readonly moreActions?: ReactNode;
}

export function ShareSheetView(props: ShareSheetViewProps) {
  const { render, deps, altText } = props;
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const [format, setFormat] = useState<ShareFormat>('story');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [result, setResult] = useState<{ readonly key: string; readonly drawn: Drawn } | null>(
    null,
  );
  const key = `${format}:${attempt}`;

  useEffect(() => {
    let live = true;
    render(format).then(
      (bytes) => {
        if (!live) return;
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a data: URI prefix, never copy.
        const uri = `data:image/png;base64,${toBase64(bytes)}`;
        setResult({ key, drawn: { status: 'ready', bytes, uri } });
      },
      () => {
        if (live) setResult({ key, drawn: { status: 'failed' } });
      },
    );
    return () => {
      live = false;
    };
  }, [render, format, key]);

  const drawn: Drawn = result?.key === key ? result.drawn : { status: 'drawing' };
  const size = SHARE_SIZE[format];

  const run = async (kind: 'share' | 'save') => {
    if (drawn.status !== 'ready' || busy !== null) return;
    setBusy(kind);
    try {
      if (kind === 'share') await shareViaSystemSheet(drawn.bytes, altText, deps);
      else {
        await saveToPhotos(drawn.bytes, deps);
        feedback.emit('success');
        toast.show({
          id: 'recap-share-saved',
          title: t({ id: 'recap.share.saved', message: 'Saved to Photos' }),
        });
      }
    } catch {
      feedback.emit('error');
      toast.show({
        id: 'recap-share-failed',
        title:
          kind === 'share'
            ? t({ id: 'recap.share.shareFailed', message: "Couldn't open the share sheet" })
            : t({ id: 'recap.share.saveFailed', message: "Couldn't save it. Check Photos access" }),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      title={props.title}
      detents={['fit']}
      onDismiss={props.onClose}
      accessibilityLabel={props.title}
      testID="recap-share-sheet"
    >
      <SheetScrollView>
        <Stack gap="16" padding="16">
          <Segmented
            label={t({ id: 'recap.share.format', message: 'Picture shape' })}
            segments={[
              { value: 'story', label: t({ id: 'recap.share.story', message: 'Story' }) },
              { value: 'post', label: t({ id: 'recap.share.post', message: 'Post' }) },
            ]}
            value={format}
            onChange={setFormat}
            testID="recap-share-format"
          />
          <View
            style={[styles.frame, { aspectRatio: size.w / size.h }]}
            testID="recap-share-preview"
          >
            {drawn.status === 'drawing' ? (
              <ActivityIndicator
                color={theme.semantic.text.primary}
                accessibilityLabel={t({
                  id: 'recap.share.drawing',
                  message: 'Drawing the picture',
                })}
              />
            ) : null}
            {drawn.status === 'failed' ? (
              <View style={styles.failed}>
                <SecondaryText variant="body">
                  {t({ id: 'recap.share.failed', message: "The picture didn't draw." })}
                </SecondaryText>
                <TextLink
                  label={t({ id: 'recap.share.retry', message: 'Try again' })}
                  onPress={() => setAttempt((n) => n + 1)}
                  testID="recap-share-retry"
                />
              </View>
            ) : null}
            {drawn.status === 'ready' ? (
              <Image
                source={{ uri: drawn.uri }}
                style={styles.image}
                resizeMode="cover"
                accessibilityLabel={altText}
                testID={`recap-share-image-${format}`}
              />
            ) : null}
          </View>
          <Stack gap="10">
            <PillButton
              label={t({ id: 'recap.share.share', message: 'Share' })}
              tone="yellow"
              block
              disabled={drawn.status !== 'ready'}
              loading={busy === 'share'}
              onPress={() => void run('share')}
              testID="recap-share-send"
            />
            <PillButton
              label={t({ id: 'recap.share.save', message: 'Save to Photos' })}
              variant="secondary"
              block
              disabled={drawn.status !== 'ready'}
              loading={busy === 'save'}
              onPress={() => void run('save')}
              testID="recap-share-save"
            />
            {props.moreActions}
          </Stack>
        </Stack>
      </SheetScrollView>
    </Sheet>
  );
}

export interface RecapShareSheetProps {
  readonly model: SummaryModel;
  readonly guide: GuideId;
  readonly unit: DistanceUnit;
  readonly onClose: () => void;
  readonly moreActions?: ReactNode;
}

export function RecapShareSheet({
  model,
  guide,
  unit,
  onClose,
  moreActions,
}: RecapShareSheetProps) {
  const locale = useLocale();
  const { t } = useLingui();
  const lines = useMemo(() => headerTitle(model).split('\n'), [model]);
  const eyebrow = headerEyebrow(model, locale);
  const render = useMemo(() => {
    const card = {
      guideKind: guideSticker(guide).kind,
      title: lines,
      eyebrow,
      tiles: model.tiles.map((tile) => tileCopy(tile, locale, unit)),
    };
    return (format: ShareFormat) => renderRecapCard(card, format);
  }, [guide, lines, eyebrow, model.tiles, locale, unit]);
  return (
    <ShareSheetView
      title={t({ id: 'recap.share.title', message: 'Share the recap' })}
      altText={`${lines.join(' ')}, ${eyebrow}`}
      render={render}
      deps={deviceShareDeps()}
      onClose={onClose}
      moreActions={moreActions}
    />
  );
}
