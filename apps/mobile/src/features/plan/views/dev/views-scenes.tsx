/**
 * Lab scenes for the calendar export sheet (SHARE on the trip map) over the Bali Six's trip map,
 * with every handler a no-op.
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { TripMapScene } from '../../trip-map/dev/plan-screens-scenes';
import { ExportSheetView, type ExportStatus } from '../export-sheet';

const noop = () => undefined;

function exportScene(canWrite: boolean, status: ExportStatus): () => ReactNode {
  return function Scene() {
    return (
      <>
        <TripMapScene snap="peek" />
        <ExportSheetView
          canWrite={canWrite}
          eventCount={11}
          status={status}
          written={11}
          onWrite={noop}
          onSubscribe={noop}
          onCopy={noop}
          onRevoke={noop}
          onClose={() => router.back()}
        />
      </>
    );
  };
}

export const VIEWS_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'export-subscribe': exportScene(false, 'idle'),
  'export-write': exportScene(true, 'idle'),
  'export-written': exportScene(true, 'written'),
  'export-denied': exportScene(true, 'denied'),
  'export-revoked': exportScene(false, 'revoked'),
};
