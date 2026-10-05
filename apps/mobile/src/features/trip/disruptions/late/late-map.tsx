/**
 * The running-late screen's map: the place and the phone's own dot on the destination's own
 * tiles, as GO draws it. Without the destination's tiles the map had only the world's to show,
 * an empty grid at street level; and on Android it draws in a texture, so the pills and the sheet
 * over it always show.
 */
import { CpMap } from '@/ui/map/CpMap';
import { plainTilesUrl, useRegionTiles } from '@/ui/map/region-pack';

import { LATE_SHEET_INSET } from './late-view';

export function LateMap(props: {
  readonly place: {
    readonly id: string;
    readonly name: string;
    readonly lat: number;
    readonly lng: number;
  };
  readonly you: { readonly lat: number; readonly lng: number } | null;
  readonly destinationSlug: string | null;
}) {
  const { place, you } = props;
  const tiles = useRegionTiles(props.destinationSlug, null);
  return (
    <CpMap
      places={[{ ...place, iconKey: 'pin', categoryLabel: '' }]}
      initialCenter={[place.lng, place.lat]}
      regionSourceUrl={plainTilesUrl(tiles)}
      androidTexture
      ornamentBottom={LATE_SHEET_INSET}
      {...(you === null
        ? {}
        : {
            youLocation: [you.lng, you.lat] as [number, number],
            locationStatus: 'granted-in-destination' as const,
          })}
    />
  );
}
