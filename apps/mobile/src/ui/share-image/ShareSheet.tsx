/**
 * The share sheet for a picture drawn on the phone (an undesigned sheet): the format switch when
 * there is more than one shape, the picture exactly as it will be shared, and the actions as a
 * plain list (share, save to Photos), so another way to share slots in as one more row. The
 * sheet's ✕ closes it.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';

import { feedback, toast } from '@/motion';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Segmented } from '@/ui/inputs/Segmented';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { makeStyles, useTheme } from '@/ui/theme';

import { saveToPhotos, shareViaSystemSheet, type ShareActionsDeps } from './share-actions';

export type ShareFormat = 'post' | 'story';

/** The pixel size of each shape: every share card draws at these, and the preview keeps the ratio. */
export const SHARE_SIZE: Readonly<Record<ShareFormat, { readonly w: number; readonly h: number }>> =
  {
    post: { w: 1080, h: 1350 },
    story: { w: 1080, h: 1920 },
  };

const DEFAULT_FORMATS: readonly ShareFormat[] = ['story', 'post'];

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

export interface ShareSheetProps {
  /** The sheet's heading; "Share" when left out. */
  readonly title?: string;
  /** Read out for the preview and handed to the share sheet as its title. */
  readonly altText: string;
  /**
   * Draws the picture in one format: what the preview shows is what is shared. The sheet redraws
   * whenever this function changes, so callers memoise it.
   */
  readonly render: (format: ShareFormat) => Promise<Uint8Array>;
  /** The shapes on offer, the first one shown first. One shape hides the switch. */
  readonly formats?: readonly ShareFormat[];
  readonly deps: ShareActionsDeps;
  readonly onClose: () => void;
  /** More ways to share, listed under the two above. */
  readonly moreActions?: ReactNode;
  /** Prefix of the sheet's test ids (`<testID>-sheet`, `-image-<format>`, `-send`, `-save`). */
  readonly testID?: string;
}

export function ShareSheet(props: ShareSheetProps) {
  const { render, deps, altText, testID = 'share' } = props;
  const formats = props.formats ?? DEFAULT_FORMATS;
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const [format, setFormat] = useState<ShareFormat>(formats[0] ?? 'story');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly render: ShareSheetProps['render'];
    readonly drawn: Drawn;
  } | null>(null);
  const key = `${format}:${String(attempt)}`;
  const title = props.title ?? t({ id: 'shareImage.title', message: 'Share' });

  useEffect(() => {
    let live = true;
    render(format).then(
      (bytes) => {
        if (!live) return;
        // Encoded here, once per drawn picture, so a re-render never pays for it again.
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a data: URI prefix, never copy.
        const uri = `data:image/png;base64,${toBase64(bytes)}`;
        setResult({ key, render, drawn: { status: 'ready', bytes, uri } });
      },
      () => {
        if (live) setResult({ key, render, drawn: { status: 'failed' } });
      },
    );
    return () => {
      live = false;
    };
  }, [render, format, key]);

  const drawn: Drawn =
    result?.key === key && result.render === render ? result.drawn : { status: 'drawing' };
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
          id: 'share-image-saved',
          title: t({ id: 'shareImage.saved', message: 'Saved to Photos' }),
        });
      }
    } catch {
      feedback.emit('error');
      toast.show({
        id: 'share-image-failed',
        title:
          kind === 'share'
            ? t({ id: 'shareImage.shareFailed', message: "Couldn't open the share sheet" })
            : t({ id: 'shareImage.saveFailed', message: "Couldn't save it. Check Photos access" }),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      title={title}
      detents={['fit']}
      onDismiss={props.onClose}
      accessibilityLabel={title}
      testID={`${testID}-sheet`}
    >
      <SheetScrollView>
        <Stack gap="16" padding="16">
          {formats.length > 1 ? (
            <Segmented
              label={t({ id: 'shareImage.format', message: 'Picture shape' })}
              segments={formats.map((value) => ({
                value,
                label:
                  value === 'story'
                    ? t({ id: 'shareImage.format.story', message: 'Story' })
                    : t({ id: 'shareImage.format.post', message: 'Post' }),
              }))}
              value={format}
              onChange={setFormat}
              testID={`${testID}-format`}
            />
          ) : null}
          <View
            style={[styles.frame, { aspectRatio: size.w / size.h }]}
            testID={`${testID}-preview`}
          >
            {drawn.status === 'drawing' ? (
              <ActivityIndicator
                color={theme.semantic.text.primary}
                accessibilityLabel={t({
                  id: 'shareImage.rendering',
                  message: 'Drawing the picture',
                })}
                testID={`${testID}-drawing`}
              />
            ) : null}
            {drawn.status === 'failed' ? (
              <View style={styles.failed}>
                <SecondaryText variant="body">
                  {t({ id: 'shareImage.error', message: "The picture didn't draw." })}
                </SecondaryText>
                <TextLink
                  label={t({ id: 'shareImage.retry', message: 'Try again' })}
                  onPress={() => setAttempt((n) => n + 1)}
                  testID={`${testID}-retry`}
                />
              </View>
            ) : null}
            {drawn.status === 'ready' ? (
              <Image
                source={{ uri: drawn.uri }}
                style={styles.image}
                resizeMode="cover"
                accessibilityLabel={altText}
                testID={`${testID}-image-${format}`}
              />
            ) : null}
          </View>
          <Stack gap="10">
            <PillButton
              label={t({ id: 'shareImage.share', message: 'Share' })}
              tone="yellow"
              block
              disabled={drawn.status !== 'ready'}
              loading={busy === 'share'}
              onPress={() => void run('share')}
              testID={`${testID}-send`}
            />
            <PillButton
              label={t({ id: 'shareImage.save', message: 'Save to Photos' })}
              variant="secondary"
              block
              disabled={drawn.status !== 'ready'}
              loading={busy === 'save'}
              onPress={() => void run('save')}
              testID={`${testID}-save`}
            />
            {props.moreActions}
          </Stack>
        </Stack>
      </SheetScrollView>
    </Sheet>
  );
}
