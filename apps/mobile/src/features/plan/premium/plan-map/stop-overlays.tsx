/**
 * What opens over the plan map for one stop: its menu (4.29) and, from the menu, its details
 * sheet. A booked stop never offers removal; a member's removal goes through the editor, which
 * turns it into a suggestion.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Share } from 'react-native';

import { useGuideActions } from '@/ui/premium/shell';

import { removeOp } from '@/data/plan/plan-ops';

import { ItemSheetHost } from '../../day/item-sheet-host';
import { tripPlanRoutes } from '../../hub/routes';
import { PremiumItemSheet } from '../stop/item-sheet';
import { StopMenu } from './stop-menu';
import type { usePlanMap } from './use-plan-map';

export function StopOverlays(props: {
  readonly tripId: string;
  readonly map: ReturnType<typeof usePlanMap>;
  readonly stopId: string;
  readonly onClose: () => void;
}) {
  const { map, tripId } = props;
  const { model, data, day } = map;
  const guideActions = useGuideActions();
  const [details, setDetails] = useState(false);
  const stop = day?.items.find((item) => item.stableId === props.stopId) ?? null;
  if (stop === null || day === null) return null;
  const row = map.rows.find((entry) => entry.id === stop.stableId);
  if (details) {
    return (
      <ItemSheetHost
        key={stop.stableId}
        plan={data.plan}
        item={stop}
        slot={{ dayNo: day.dayNo, date: day.date ?? '' }}
        editor={map.editor}
        onClose={props.onClose}
        Sheet={PremiumItemSheet}
      />
    );
  }
  return (
    <StopMenu
      stop={{
        id: stop.stableId,
        dayNo: day.dayNo,
        title: stop.title,
        line: row?.time ?? null,
        booked: stop.bookingId !== null,
        leg: row?.legAfter ?? null,
      }}
      guideName={model.guide.name}
      onClose={props.onClose}
      onDetails={() => setDetails(true)}
      onTime={() => setDetails(true)}
      onMove={() => router.push(tripPlanRoutes.days(tripId, day.dayNo))}
      onAsk={guideActions.ask}
      onShare={() => void Share.share({ message: stop.title })}
      onRemove={
        model.readOnly || stop.bookingId !== null
          ? undefined
          : () => void map.editor.submit([removeOp(stop)])
      }
    />
  );
}
