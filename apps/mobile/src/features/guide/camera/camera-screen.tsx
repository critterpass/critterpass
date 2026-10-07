/**
 * Point and ask on the device: the back camera with a photo output, one still per scan read by
 * the phone's own text recognition, and the lines sent to the menu route. The photo never leaves
 * the phone and is not saved. A build or a phone without a working camera says so and points back
 * to typing.
 */
/* eslint-disable lingui/no-unlocalized-strings -- api paths, wire values and design ids, never copy. */
import { router, useIsFocused } from 'expo-router';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, StyleSheet } from 'react-native';

import { useLingui } from '@lingui/react/macro';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { guideSticker } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';

import { guideAvatarId } from '../chat/components/guide-header';
import { useGuideContext } from '../chat/data/use-guide-context';
import { CameraView, type MenuFollowUp } from './camera-view';
import { dishList, MENU_AIMING, menuStickers, type MenuLine, type MenuReading } from './menu-scan';
import {
  createMenuScanController,
  type MenuScanController,
  type MenuScanPorts,
  type RecognisedStill,
} from './menu-scan-controller';
import { menuCameraModule, type VisionCamera } from './vision-camera';

async function readMenuOnServer(
  tripId: string | null,
  lines: readonly MenuLine[],
): Promise<MenuReading> {
  const response = await fetch(`${resolveApiBaseUrl()}/v1/camera/menu`, {
    method: 'POST',
    headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
    body: JSON.stringify({
      trip_id: tripId,
      ocr_lines: lines.map((line) => ({ id: line.id, text: line.text, bbox: [...line.bbox] })),
    }),
  });
  const body = (await response.json().catch(() => null)) as
    | (Partial<MenuReading> & {
        error?: { code?: string; detail?: { reason?: string } };
      })
    | null;
  if (!response.ok || body === null || body.error !== undefined) {
    throw Object.assign(new Error('menu reading refused'), {
      code: body?.error?.code,
      reason: body?.error?.detail?.reason,
    });
  }
  return {
    status: body.status ?? 'failed',
    items: body.items ?? [],
    suggestion: body.suggestion ?? null,
    checked_members: body.checked_members ?? [],
  };
}

/** The back camera with a photo output; hands the screen a way to take one still. */
function MenuCamera({
  camera,
  onCapture,
  onFailed,
}: {
  readonly camera: VisionCamera;
  readonly onCapture: (capture: (() => Promise<string | null>) | null) => void;
  readonly onFailed: (issue: 'no_camera' | 'camera_denied') => void;
}) {
  const focused = useIsFocused();
  const { hasPermission, canRequestPermission, requestPermission } = camera.useCameraPermission();
  const device = camera.useCameraDevice('back');
  const photo = camera.usePhotoOutput({
    targetResolution: camera.CommonResolutions.FHD_4_3,
    qualityPrioritization: 'speed',
  });
  useEffect(() => {
    // Asked here, in context: the person has just opened the menu camera.
    if (canRequestPermission) void requestPermission().catch(() => onFailed('camera_denied'));
  }, [canRequestPermission, requestPermission, onFailed]);
  const refused = !hasPermission && !canRequestPermission;
  useEffect(() => {
    if (refused) onFailed('camera_denied');
  }, [refused, onFailed]);
  useEffect(() => {
    onCapture(async () => {
      const file = await photo.capturePhotoToFile({ enableShutterSound: false }, {});
      return file.filePath.startsWith('file://') ? file.filePath : `file://${file.filePath}`;
    });
    return () => onCapture(null);
  }, [photo, onCapture]);
  if (!hasPermission || device === undefined) return null;
  return (
    <camera.Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={focused}
      outputs={[photo]}
      onError={() => onFailed('no_camera')}
    />
  );
}

export interface CameraScreenProps {
  readonly tripId: string | null;
  /** The phone's text recognition; null in a build without it. */
  readonly recognize: ((uri: string) => Promise<RecognisedStill>) | null;
}

export function CameraScreen(props: CameraScreenProps) {
  const localFirst = useContext(LocalFirstContext);
  return localFirst === null ? null : <OpenCameraScreen {...props} />;
}

function OpenCameraScreen({ tripId, recognize }: CameraScreenProps) {
  const { t } = useLingui();
  const context = useGuideContext(tripId);
  const trip = context.trip;
  const sync = useSyncStatus();
  const [state, setState] = useState(MENU_AIMING);
  const camera = useMemo(() => (recognize === null ? null : menuCameraModule()), [recognize]);
  const capture = useRef<(() => Promise<string | null>) | null>(null);
  const controller = useRef<MenuScanController | null>(null);
  const live = useRef({ online: true, tripId: trip?.tripId ?? null });
  const online = sync.phase !== 'offline';
  const liveTripId = trip?.tripId ?? null;
  useEffect(() => {
    live.current = { online, tripId: liveTripId };
  }, [online, liveTripId]);

  useEffect(() => {
    const ports: MenuScanPorts = {
      capture: () => capture.current?.() ?? Promise.resolve(null),
      recognize: (uri) =>
        recognize === null ? Promise.reject(new Error('no recogniser')) : recognize(uri),
      online: () => live.current.online,
      read: (lines) => readMenuOnServer(live.current.tripId, lines),
    };
    const scan = createMenuScanController(ports, setState);
    controller.current = scan;
    if (camera === null) scan.cameraFailed('no_camera');
    return () => {
      scan.dispose();
      controller.current = null;
    };
  }, [camera, recognize]);

  const onCapture = useCallback((next: (() => Promise<string | null>) | null) => {
    capture.current = next;
  }, []);
  const onFailed = useCallback(
    (issue: 'no_camera' | 'camera_denied') => controller.current?.cameraFailed(issue),
    [],
  );

  const stickers = menuStickers(state.lines, state.reading);
  const dishes = dishList(stickers);
  const tripParams = trip === null ? {} : { tripId: trip.tripId };
  const askGuide = (question: string) => {
    const sheet = hrefFor('3j-1', {
      ...tripParams,
      q: t({ id: 'guide.camera.askWithMenu', message: `${question} The menu: ${dishes}` }),
    });
    if (sheet !== undefined) router.push(sheet);
  };
  const split = trip === null ? undefined : hrefFor('3i-2', tripParams);
  const voice = hrefFor('3j-2', tripParams);
  const crewSize = trip?.crewSize ?? 1;
  const leastSpicy = t({ id: 'guide.camera.leastSpicy', message: 'Least spicy?' });
  const orderFor = t({ id: 'guide.camera.orderFor', message: `Order for ${crewSize}` });
  const followUps: MenuFollowUp[] = [
    {
      id: 'least-spicy',
      label: leastSpicy,
      onPress: () =>
        askGuide(
          t({ id: 'guide.camera.leastSpicyAsk', message: 'Which of these is the least spicy?' }),
        ),
    },
    ...(crewSize > 1
      ? [
          {
            id: 'order',
            label: orderFor,
            onPress: () =>
              askGuide(
                t({
                  id: 'guide.camera.orderForAsk',
                  message: `What should we order for ${crewSize} people, and how do I say it?`,
                }),
              ),
          },
        ]
      : []),
    ...(split === undefined
      ? []
      : [
          {
            id: 'split',
            label: t({ id: 'guide.camera.split', message: 'Split the bill' }),
            onPress: () => router.push(split),
          },
        ]),
  ];
  const sticker = guideSticker(guideAvatarId(context.guideSlug));

  return (
    <CameraView
      guideName={context.guideName}
      sticker={<Sticker kind={sticker.kind} name={sticker.name} size={48} />}
      state={state}
      camera={
        camera === null || state.issue === 'no_camera' || state.issue === 'camera_denied' ? null : (
          <MenuCamera camera={camera} onCapture={onCapture} onFailed={onFailed} />
        )
      }
      still={
        state.still === null ? null : (
          <Image
            source={{ uri: state.still.uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        )
      }
      followUps={followUps}
      onScan={() => void controller.current?.scan()}
      onRetake={() => controller.current?.retake()}
      onAsk={askGuide}
      {...(voice === undefined ? {} : { onMic: () => router.push(voice) })}
      onClose={() => router.back()}
      onOpenSettings={() => void Linking.openSettings()}
    />
  );
}
