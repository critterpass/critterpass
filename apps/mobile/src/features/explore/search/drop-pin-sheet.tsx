/**
 * DROP A PIN (7d-4, undesigned): a place the guide doesn't know yet. The map moves under a fixed
 * pin; a name and ADD TO IDEAS save it to the trip's Ideas as a pin (`save_idea{pin}`), which
 * works offline from the queue.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { generateUuidV7 } from '@cp/domain';
import { t } from '@lingui/core/macro';
import type { CameraRef, LngLat } from '@maplibre/maplibre-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useLiveRows } from '@/data/plan/live-rows';
import { makeStyles } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { Icon } from '@/ui/icons/Icon';
import { TextField } from '@/ui/inputs/TextField';
import { PlanningMapCanvas } from '@/ui/map/planning';
import { Sheet } from '@/ui/sheet/Sheet';

import { saveIdeaCommand } from './commands';

const CENTRE_SQL = `SELECT avg(lat) AS lat, avg(lng) AS lng FROM pois
  WHERE destination_id = ? AND status = 'active'`;
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
  readonly onSaved: (name: string) => void;
  readonly onClose: () => void;
}

export function DropPinSheet(props: DropPinSheetProps) {
  const styles = useStyles();
  const save = useCommand(saveIdeaCommand);
  const cameraRef = useRef<CameraRef | null>(null);
  const centre = useLiveRows<{ lat: number | null; lng: number | null }>(
    CENTRE_SQL,
    props.destinationId === null ? null : [props.destinationId],
    ['pois'],
  ).rows[0];
  const start =
    props.start ??
    (centre?.lat === null || centre?.lat === undefined || centre.lng === null
      ? null
      : { lat: centre.lat, lng: centre.lng });
  const [point, setPoint] = useState<LngLat | null>(null);
  const [name, setName] = useState(props.name);
  const title = t({ id: 'search.pin.title', message: 'Drop a pin' });
  const at: LngLat | null = point ?? (start === null ? null : [start.lng, start.lat]);
  const add = () => {
    if (at === null || name.trim() === '') return;
    void save.send({
      idea_id: generateUuidV7(),
      trip_id: props.tripId,
      pin: { name: name.trim(), lat: at[1], lng: at[0] },
      source: 'pin',
    });
    props.onSaved(name.trim());
  };
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
        <TextField
          label={t({ id: 'search.pin.name', message: 'What is it called?' })}
          value={name}
          onChangeText={setName}
          testID="search-drop-pin-name"
        />
        <PillButton
          label={t({ id: 'search.pin.add', message: 'Add to Ideas' })}
          onPress={add}
          disabled={at === null || name.trim() === ''}
          block
          testID="search-drop-pin-add"
        />
      </View>
    </Sheet>
  );
}
