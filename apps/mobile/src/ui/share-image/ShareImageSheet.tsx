import { useLingui } from '@lingui/react/macro';
import { parseColor, tokens } from '@cp/design-tokens';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ShareActionsDeps } from './share-actions';
import { canShareToInstagramStories, saveToPhotos, shareViaSystemSheet } from './share-actions';

export type ShareFormat = 'post' | 'story';

export interface ShareImageSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** Read out for the preview image and the platform share sheet's own attachment description. */
  readonly altText: string;
  readonly formats?: readonly ShareFormat[];
  /** Renders one format to PNG bytes — template-specific, supplied by the caller (a share card's own `build*`/`renderShareCardNode`). */
  readonly render: (format: ShareFormat) => Promise<Uint8Array>;
  readonly deps: ShareActionsDeps;
}

type SheetState =
  | { readonly status: 'rendering' }
  | { readonly status: 'ready'; readonly bytes: Uint8Array }
  | { readonly status: 'error'; readonly message: string };

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

const scrimRgb = parseColor(tokens.color.scrim.hex);
// eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS colour function, not user-facing copy
const SCRIM_COLOR = `rgba(${scrimRgb.r}, ${scrimRgb.g}, ${scrimRgb.b}, ${tokens.color.scrim.alphaMax})`;

/**
 * The share-card preview sheet: format toggle (post/story), a rendering/failure state, and the
 * three hand-off actions (system share, save to Photos, Instagram Stories when available). Not a
 * designed screen — the design source only specifies the cards themselves — so this composes
 * existing components/tokens per the phase's own "undesigned states" convention.
 */
export function ShareImageSheet(props: ShareImageSheetProps): React.JSX.Element | null {
  const { visible, onClose, altText, render, deps } = props;
  const formats = props.formats ?? (['post'] as const);
  const { t } = useLingui();
  const [format, setFormat] = useState<ShareFormat>(formats[0] ?? 'post');
  const [canInstagram, setCanInstagram] = useState(false);
  // Bumped by the Retry button to re-run the render effect for the same format.
  const [attempt, setAttempt] = useState(0);
  // Keyed by (format, attempt) so a still-loading render never briefly shows a previous attempt's
  // result — computing the displayed state from this instead of an effect-set "rendering" status
  // avoids setting state synchronously from the effect body itself.
  const [result, setResult] = useState<{
    readonly format: ShareFormat;
    readonly attempt: number;
    readonly data: SheetState;
  } | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    render(format).then(
      (bytes) => {
        if (!cancelled) setResult({ format, attempt, data: { status: 'ready', bytes } });
      },
      (error: unknown) => {
        if (!cancelled) {
          setResult({
            format,
            attempt,
            data: {
              status: 'error',
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [visible, format, attempt, render]);

  const state: SheetState =
    result && result.format === format && result.attempt === attempt
      ? result.data
      : { status: 'rendering' };

  useEffect(() => {
    if (!visible) return;
    canShareToInstagramStories(deps).then(setCanInstagram, () => setCanInstagram(false));
  }, [visible, deps]);

  if (!visible) return null;

  const retry = (): void => {
    setAttempt((value) => value + 1);
  };
  const share = (): void => {
    if (state.status === 'ready') void shareViaSystemSheet(state.bytes, altText, deps);
  };
  const save = (): void => {
    if (state.status === 'ready') void saveToPhotos(state.bytes, deps);
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {formats.length > 1 && (
            <View style={styles.formatRow}>
              {formats.map((candidate) => (
                <Pressable
                  key={candidate}
                  accessibilityRole="button"
                  onPress={() => setFormat(candidate)}
                  style={[styles.formatButton, candidate === format && styles.formatButtonActive]}
                >
                  <Text>
                    {candidate === 'post'
                      ? t({ id: 'shareImage.format.post', message: 'Post' })
                      : t({ id: 'shareImage.format.story', message: 'Story' })}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.preview}>
            {state.status === 'rendering' && (
              <ActivityIndicator
                accessibilityLabel={t({
                  id: 'shareImage.rendering',
                  message: 'Rendering share image',
                })}
              />
            )}
            {state.status === 'error' && (
              <View>
                <Text>
                  {t({ id: 'shareImage.error', message: 'Could not render this image.' })}
                </Text>
                <Pressable accessibilityRole="button" onPress={retry}>
                  <Text>{t({ id: 'shareImage.retry', message: 'Retry' })}</Text>
                </Pressable>
              </View>
            )}
            {state.status === 'ready' && (
              <Image
                accessibilityLabel={altText}
                // eslint-disable-next-line lingui/no-unlocalized-strings -- a data: URI scheme prefix, not user-facing copy
                source={{ uri: `data:image/png;base64,${toBase64(state.bytes)}` }}
                style={styles.image}
                resizeMode="contain"
              />
            )}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              disabled={state.status !== 'ready'}
              onPress={share}
            >
              <Text>{t({ id: 'shareImage.share', message: 'Share' })}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={state.status !== 'ready'}
              onPress={save}
            >
              <Text>{t({ id: 'shareImage.save', message: 'Save to Photos' })}</Text>
            </Pressable>
            {canInstagram && (
              <Pressable
                accessibilityRole="button"
                disabled={state.status !== 'ready'}
                testID="share-instagram-stories"
              >
                <Text>{t({ id: 'shareImage.instagram', message: 'Add to Story' })}</Text>
              </Pressable>
            )}
          </View>

          <Pressable accessibilityRole="button" onPress={onClose}>
            <Text>{t({ id: 'shareImage.close', message: 'Close' })}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: SCRIM_COLOR,
  },
  sheet: {
    backgroundColor: tokens.color.paper.base,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    padding: tokens.space[16],
    gap: tokens.space[14],
  },
  formatRow: {
    flexDirection: 'row',
    gap: tokens.space[8],
  },
  formatButton: {
    paddingVertical: tokens.space[8],
    paddingHorizontal: tokens.space[14],
    borderRadius: tokens.radius.md,
    backgroundColor: 'transparent',
  },
  formatButtonActive: {
    backgroundColor: tokens.color.paper.bright,
  },
  preview: {
    aspectRatio: 4 / 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
});
