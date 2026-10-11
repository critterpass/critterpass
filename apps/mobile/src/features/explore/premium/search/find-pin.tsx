/**
 * Drop a pin from Find (4.33 "Drop a pin", undesigned as a sheet): a place the guide doesn't know
 * yet. The map moves under a fixed pin; a name and Add to Ideas save it to the trip's Ideas as a
 * pin, which works offline from the queue. Cancel (or a tap on the dimmed page) leaves it.
 */
import { t } from '@lingui/core/macro';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { useRef } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  GlassSurface,
  Icon,
  Text,
  TextButton,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';

import { useShellExtras } from '@/ui/premium/shell/shell-theme';

import { PremiumMapCanvas } from '@/features/plan';
import type { SearchTrip } from '../../search/use-search-trip';
import { useDropPin } from '../../search/use-drop-pin';

const PIN = 34;
const MAP_HEIGHT = 260;

export interface FindPinProps {
  readonly tripId: string;
  readonly trip: SearchTrip;
  readonly start: { readonly lat: number; readonly lng: number } | null;
  readonly name: string;
  /** The address the pin starts on, when it was opened from one: shown, never saved. */
  readonly hint?: string | undefined;
  readonly onSaved: (name: string) => void;
  readonly onClose: () => void;
}

export function FindPin(props: FindPinProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { scrim } = useShellExtras();
  const camera = useRef<CameraRef | null>(null);
  const { start, name, setName, setPoint, canAdd, add } = useDropPin({
    ...props,
    destinationId: props.trip.destinationId,
  });
  const title = t({ id: 'search.pin.title', message: 'Drop a pin' });
  return (
    <Modal transparent visible animationType="slide" onRequestClose={props.onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]}
          onPress={props.onClose}
          accessibilityLabel={t({ id: 'common.cancel', message: 'Cancel' })}
        />
        <GlassSurface
          kind="sheet"
          testID="search-drop-pin"
          style={{
            marginHorizontal: theme.space.gap8,
            marginBottom: Math.max(insets.bottom, theme.space.gap8),
            borderRadius: theme.radius.sheet,
            paddingHorizontal: theme.space.gutter,
            paddingTop: theme.space.gap16,
            paddingBottom: theme.space.gap16,
            gap: theme.space.gap14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextButton
              label={t({ id: 'common.cancel', message: 'Cancel' })}
              onPress={props.onClose}
              testID="search-drop-pin-cancel"
            />
            <Text variant="headline" align="center" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </Text>
            <View style={{ width: 56 }} />
          </View>
          {start === null ? null : (
            <View
              style={{ height: MAP_HEIGHT, borderRadius: theme.radius.card, overflow: 'hidden' }}
            >
              <PremiumMapCanvas
                cameraRef={camera}
                initialCenter={[start.lng, start.lat]}
                initialZoom={15}
                destinationSlug={props.trip.destinationSlug}
                onRegionChange={(region) => setPoint(region.center)}
                testID="search-drop-pin-map"
              />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  marginLeft: -PIN / 2,
                  marginTop: -PIN,
                }}
              >
                <Icon name="pin" size={PIN} />
              </View>
            </View>
          )}
          {props.hint === undefined ? null : (
            <Text variant="caption" tone="muted" testID="search-drop-pin-hint">
              {props.hint}
            </Text>
          )}
          <TextField
            accessibilityLabel={t({ id: 'search.pin.name', message: 'What is it called?' })}
            placeholder={t({ id: 'search.pin.name', message: 'What is it called?' })}
            value={name}
            onChangeText={setName}
            returnKeyType="done"
            testID="search-drop-pin-name"
          />
          <Button
            label={t({ id: 'search.pin.add', message: 'Add to Ideas' })}
            onPress={add}
            disabled={!canAdd}
            testID="search-drop-pin-add"
          />
        </GlassSurface>
      </KeyboardAvoidingView>
    </Modal>
  );
}
