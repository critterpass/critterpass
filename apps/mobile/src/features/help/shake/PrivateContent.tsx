/**
 * Marks part of a screen as private: while a problem report's screenshot is being taken its
 * children are covered, so the picture shows the screen without them. Costs nothing otherwise.
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { maskStore, type MaskMode } from './mask';

export function useMasking(): MaskMode | null {
  return useSyncExternalStore(maskStore.subscribe, maskStore.get, maskStore.get);
}

const useStyles = makeStyles((t) => ({
  cover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: t.semantic.bg.control,
    borderRadius: t.radius.sm,
  },
  screen: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: t.semantic.bg.base,
    alignItems: 'center',
    justifyContent: 'center',
    padding: t.size.gutter,
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
