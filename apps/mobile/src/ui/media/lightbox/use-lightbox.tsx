/**
 * Opening the viewer from a screen: `useLightbox(items)` gives `open(key)` for a tap on one of the
 * set's pictures and the viewer to render while it is open; `LightboxThumb` is the pressable around
 * a picture, saying which one of how many it opens.
 */
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { PressScale } from '../../press/PressScale';
import { Lightbox } from './Lightbox';
import { indexOfKey, type LightboxItem } from './lightbox-model';

export interface LightboxHandle {
  readonly open: (key: string) => void;
  /** Null while closed. */
  readonly viewer: ReactNode;
}

export function useLightbox(items: readonly LightboxItem[], testID?: string): LightboxHandle {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return {
    open: setOpenKey,
    viewer:
      openKey === null || items.length === 0 ? null : (
        <Lightbox
          items={items}
          initialIndex={indexOfKey(items, openKey)}
          onClose={() => setOpenKey(null)}
          {...(testID === undefined ? {} : { testID })}
        />
      ),
  };
}

/** "Open photo", or "Open photo 2 of 5" in a set. */
export function useOpenPhotoLabel(): (position?: number, total?: number) => string {
  const { t } = useLingui();
  return (position, total) =>
    position === undefined || total === undefined || total <= 1
      ? t({ id: 'common.lightbox.open', message: 'Open photo' })
      : t({ id: 'common.lightbox.openOf', message: `Open photo ${position} of ${total}` });
}

export interface LightboxThumbProps {
  readonly onPress: () => void;
  /** Counted from one. */
  readonly position?: number;
  readonly total?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  readonly children: ReactNode;
}

export function LightboxThumb({
  onPress,
  position,
  total,
  style,
  testID,
  children,
}: LightboxThumbProps) {
  const label = useOpenPhotoLabel();
  return (
    <PressScale
      accessibilityRole="imagebutton"
      accessibilityLabel={label(position, total)}
      onPress={onPress}
      style={style}
      testID={testID}
    >
      {children}
    </PressScale>
  );
}
