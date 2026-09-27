/**
 * The iOS first-launch paste offer: the system paste control (UIPasteControl, so the pasteboard is
 * read only when the person taps it and no paste alert appears) over the launch screen, with a
 * close button to continue without it. Where the control is unavailable it hands straight over.
 */
import * as Clipboard from 'expo-clipboard';
import { useEffect } from 'react';
import { View } from 'react-native';

import type { PasteOfferControls } from '@/lib/links/SplashResolveGate';
import { makeStyles, MIN_TOUCH_TARGET } from '@/ui';
import { CloseButton } from '@/ui/sheet/CloseButton';

const PASTE_WIDTH = 200;

const useStyles = makeStyles((t) => ({
  root: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    backgroundColor: t.semantic.bg.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    position: 'absolute',
    top: t.size.cta.bottom,
    end: t.size.gutter,
  },
  paste: { width: PASTE_WIDTH, height: MIN_TOUCH_TARGET },
}));

export interface PasteLinkOfferProps extends PasteOfferControls {
  /** The offer is on screen: the launch splash can go. */
  readonly onShown: () => void;
}

export function PasteLinkOffer({ onPasted, onSkip, onShown }: PasteLinkOfferProps) {
  const styles = useStyles();
  const available = Clipboard.isPasteButtonAvailable;

  useEffect(() => {
    onShown();
    if (!available) onSkip();
  }, [available, onShown, onSkip]);

  if (!available) return null;
  return (
    <View style={styles.root} testID="paste-link-offer">
      <Clipboard.ClipboardPasteButton
        acceptedContentTypes={['url', 'plain-text']}
        displayMode="iconAndLabel"
        style={styles.paste}
        onPress={(data) => {
          if (data.type === 'text') onPasted(data.text);
        }}
      />
      <CloseButton onPress={onSkip} style={styles.close} testID="paste-link-skip" />
    </View>
  );
}
