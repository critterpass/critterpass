/**
 * Marks part of a screen as private: while a problem report's screenshot is being taken its
 * children are covered, so the picture shows the screen without them. Costs nothing otherwise.
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makePremiumStyles, Text } from '@/ui/premium';

import { maskStore, type MaskMode } from './mask';

export function useMasking(): MaskMode | null {
  return useSyncExternalStore(maskStore.subscribe, maskStore.get, maskStore.get);
}

const useStyles = makePremiumStyles((t) => ({
  cover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: t.color.control,
    borderRadius: 8,
  },
  screen: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: t.color.ground,
    alignItems: 'center',
    justifyContent: 'center',
    padding: t.space.gutter,
  },
}));

export function PrivateContent(props: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const masking = useMasking();
  return (
    <View style={props.style}>
      {props.children}
      {masking === null ? null : <View style={styles.cover} testID="private-content-cover" />}
    </View>
  );
}

/** The whole-screen cover for private screens, mounted once above everything else. */
export function ScreenMaskCover({ label }: { readonly label: string }) {
  const styles = useStyles();
  const masking = useMasking();
  if (masking !== 'screen') return null;
  return (
    <View style={styles.screen} pointerEvents="none" testID="screen-mask-cover">
      <Text variant="body">{label}</Text>
    </View>
  );
}
