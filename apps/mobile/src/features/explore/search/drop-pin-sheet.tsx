/**
 * DROP A PIN (7d-4, undesigned): a place the guide doesn't know yet. The map moves under a fixed
 * pin; a name and ADD TO IDEAS save it to the trip's Ideas as a pin (`save_idea{pin}`), which
 * works offline from the queue.
 */
import { t } from '@lingui/core/macro';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { useRef } from 'react';
import { View } from 'react-native';

import { makeStyles, Text, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { Icon } from '@/ui/icons/Icon';
import { TextField } from '@/ui/inputs/TextField';
import { PlanningMapCanvas } from '@/ui/map/planning';
import { Sheet } from '@/ui/sheet/Sheet';

import { useDropPin } from './use-drop-pin';

const PIN_SIZE = 34;

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingBottom: th.space['24'], gap: th.space['14'] },
  map: { height: 260, borderRadius: th.radius.lg, overflow: 'hidden' },
  pin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -PIN_SIZE / 2,
    marginTop: -PIN_SIZE,
  },
}));

export interface DropPinSheetProps {
  readonly tripId: string;
  readonly destinationId: string | null;
  readonly destinationSlug: string | null;
  /** Where the pin starts (the search's scope), else the middle of the destination's places. */
  readonly start: { readonly lat: number; readonly lng: number } | null;
  readonly name: string;
  /** The address the pin starts on, when it was opened from one: shown, never saved. */
  readonly hint?: string | undefined;
  readonly onSaved: (name: string) => void;
  readonly onClose: () => void;
}

export function DropPinSheet(props: DropPinSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const cameraRef = useRef<CameraRef | null>(null);
  const { start, name, setName, setPoint, canAdd, add } = useDropPin(props);
  const title = t({ id: 'search.pin.title', message: 'Drop a pin' });
  return (
    <Sheet
      title={title}
      onDismiss={props.onClose}
      accessibilityLabel={title}
      testID="search-drop-pin"
    >
      <View style={styles.body}>
        {start === null ? null : (
          <View style={styles.map}>
            <PlanningMapCanvas
              initialCenter={[start.lng, start.lat]}
              initialZoom={15}
              destinationSlug={props.destinationSlug}
              cameraRef={cameraRef}
              onRegionChange={(region) => setPoint(region.center)}
              testID="search-drop-pin-map"
            />
            <View style={styles.pin} pointerEvents="none">
              <Icon name="pin" size={PIN_SIZE} decorative />
            </View>
          </View>
        )}
        {props.hint === undefined ? null : (
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            testID="search-drop-pin-hint"
          >
            {props.hint}
          </Text>
        )}
        <TextField
          label={t({ id: 'search.pin.name', message: 'What is it called?' })}
          value={name}
          onChangeText={setName}
          testID="search-drop-pin-name"
        />
        <PillButton
          label={t({ id: 'search.pin.add', message: 'Add to Ideas' })}
          onPress={add}
          disabled={!canAdd}
          block
          testID="search-drop-pin-add"
        />
      </View>
    </Sheet>
  );
}
