/**
 * Sharing a recap picture in the premium look: Story or Post, the picture drawn on the phone (a
 * spinner while it draws, Try again if it fails), then Share (the system sheet) and Save to
 * Photos. The same rendering and share actions as the current share sheet.
 */
import { t } from '@lingui/core/macro';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, View } from 'react-native';

import { PremiumSheet } from '@/features/album';
import { feedback } from '@/motion';
import {
  Button,
  SegmentedControl,
  Spinner,
  Text,
  TextButton,
  makePremiumStyles,
  useToast,
} from '@/ui/premium';
import {
  saveToPhotos,
  shareViaSystemSheet,
  type ShareActionsDeps,
} from '@/lib/share-image/share-actions';
import { SHARE_SIZE, type ShareFormat } from '@/ui/share-image/ShareSheet';

type Drawn =
  | { readonly status: 'drawing' }
  | { readonly status: 'ready'; readonly bytes: Uint8Array; readonly uri: string }
  | { readonly status: 'failed' };

const useStyles = makePremiumStyles((th) => ({
  frame: {
    alignSelf: 'center',
    height: 260,
    borderRadius: th.radius.card,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.control,
  },
}));

/** The drawn picture as an image source. */
function pngDataUri(bytes: Uint8Array): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a data: URI prefix, never copy.
  return `data:image/png;base64,${toBase64(bytes)}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

export function PremiumShareSheet({
  altText,
  render,
  deps,
  onClose,
  title,
  moreActions,
  testID = 'share',
}: {
  readonly title?: string;
  /** Rows under the two actions (the recap's link). */
  readonly moreActions?: ReactNode;
  readonly altText: string;
  readonly render: (format: ShareFormat) => Promise<Uint8Array>;
  readonly deps: ShareActionsDeps;
  readonly onClose: () => void;
  readonly testID?: string;
}) {
  const styles = useStyles();
  const toast = useToast();
  const [format, setFormat] = useState<ShareFormat>('story');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [result, setResult] = useState<{ readonly key: string; readonly drawn: Drawn } | null>(
    null,
  );
  const key = `${format}:${String(attempt)}`;
  useEffect(() => {
    let live = true;
    render(format).then(
      (bytes) => {
        if (live) setResult({ key, drawn: { status: 'ready', bytes, uri: pngDataUri(bytes) } });
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
          kind: 'done',
          message: t({ id: 'shareImage.saved', message: 'Saved to Photos' }),
        });
      }
    } catch {
      feedback.emit('error');
      toast.show({
        kind: 'error',
        message:
          kind === 'share'
            ? t({ id: 'shareImage.shareFailed', message: "Couldn't open the share sheet" })
            : t({ id: 'shareImage.saveFailed', message: "Couldn't save it. Check Photos access" }),
      });
    } finally {
      setBusy(null);
    }
  };
  return (
    <PremiumSheet
      title={title ?? t({ id: 'shareImage.title', message: 'Share' })}
      onClose={onClose}
      testID={`${testID}-sheet`}
    >
      <SegmentedControl
        options={[
          { value: 'story', label: t({ id: 'shareImage.format.story', message: 'Story' }) },
          { value: 'post', label: t({ id: 'shareImage.format.post', message: 'Post' }) },
        ]}
        value={format}
        onChange={setFormat}
        accessibilityLabel={t({ id: 'shareImage.format', message: 'Picture shape' })}
        testID={`${testID}-format`}
      />
      <View style={[styles.frame, { aspectRatio: size.w / size.h }]} testID={`${testID}-preview`}>
        {drawn.status === 'drawing' ? (
          <View
            accessible
            accessibilityLabel={t({ id: 'shareImage.rendering', message: 'Drawing the picture' })}
          >
            <Spinner />
          </View>
        ) : null}
        {drawn.status === 'failed' ? (
          <View style={{ alignItems: 'center', gap: 8, padding: 16 }}>
            <Text variant="body" tone="muted">
              {t({ id: 'shareImage.error', message: "The picture didn't draw." })}
            </Text>
            <TextButton
              label={t({ id: 'shareImage.retry', message: 'Try again' })}
              onPress={() => setAttempt((n) => n + 1)}
              testID={`${testID}-retry`}
            />
          </View>
        ) : null}
        {drawn.status === 'ready' ? (
          <Image
            source={{ uri: drawn.uri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            accessibilityLabel={altText}
            testID={`${testID}-image-${format}`}
          />
        ) : null}
      </View>
      <Button
        label={t({ id: 'shareImage.share', message: 'Share' })}
        disabled={drawn.status !== 'ready'}
        loading={busy === 'share'}
        onPress={() => void run('share')}
        testID={`${testID}-send`}
      />
      <Button
        variant="secondary"
        label={t({ id: 'shareImage.save', message: 'Save to Photos' })}
        disabled={drawn.status !== 'ready'}
        loading={busy === 'save'}
        onPress={() => void run('save')}
        testID={`${testID}-save`}
      />
      {moreActions}
    </PremiumSheet>
  );
}
