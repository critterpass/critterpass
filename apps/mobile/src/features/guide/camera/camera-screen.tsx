/**
 * Point and ask on the device: the back camera with a photo output, one still per scan read by
 * the phone's own text recognition, and the lines sent to the menu route, whose reading streams
 * back. The photo never leaves the phone and is not saved. The dishes can be put together as an
 * order to show the person taking it, and the order can start an expense. A build or a phone
 * without a working camera says so and points back to typing.
 */
/* eslint-disable lingui/no-unlocalized-strings -- api paths, wire values and design ids, never copy. */
import { router, useIsFocused } from 'expo-router';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, StyleSheet } from 'react-native';

import type { GuideThreadMode } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { goBackOr } from '@/lib/navigation/back';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { guideSticker } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';

import { guideAvatarId } from '../chat/components/guide-header';
import { GuideStreamError } from '../chat/data/guide-frames';
import { handToSheet } from '../chat/data/handed-question';
import { streamGuide } from '../chat/data/guide-stream';
import { useGuideContext } from '../chat/data/use-guide-context';
import { CameraView, type MenuFollowUp } from './camera-view';
import { showModeHref } from '../phrases/phrase-card';
import { languagePair, useLanguageNames } from './menu-language';
import { MenuOrderCard } from './menu-order-card';
import { createMenuReadingFold, MenuReadingError } from './menu-reading';
import {
  changeOrder,
  dishList,
  MENU_AIMING,
  menuStickers,
  orderCard,
  orderExpenseName,
  orderLines,
  type MenuLine,
  type MenuOrder,
  type MenuReading,
} from './menu-scan';
import {
  createMenuScanController,
  type MenuScanController,
  type MenuScanPorts,
  type RecognisedStill,
} from './menu-scan-controller';
import { menuCameraModule, type VisionCamera } from './vision-camera';

/** `POST /v1/camera/menu` as an event stream: the dishes as they arrive, closed by `done`. */
async function readMenuOnServer(
  tripId: string | null,
  lines: readonly MenuLine[],
): Promise<MenuReading> {
  const fold = createMenuReadingFold();
  try {
    await streamGuide(
      '/v1/camera/menu',
      {
        trip_id: tripId,
        ocr_lines: lines.map((line) => ({ id: line.id, text: line.text, bbox: [...line.bbox] })),
      },
      (frame) => fold.frame(frame),
    );
  } catch (error) {
    if (!(error instanceof GuideStreamError)) throw error;
    const reason = error.detail['reason'];
    throw new MenuReadingError(error.code, typeof reason === 'string' ? reason : null);
  }
  return fold.result();
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
  /** GROUP or JUST ME of the sheet the camera was opened from; null when it was not. */
  readonly mode?: GuideThreadMode | null;
  /** Opened from the guide sheet, which is still open underneath. */
  readonly fromSheet?: boolean;
  /** The phone's text recognition; null in a build without it. */
  readonly recognize: ((uri: string) => Promise<RecognisedStill>) | null;
}

export function CameraScreen(props: CameraScreenProps) {
  const localFirst = useContext(LocalFirstContext);
  return localFirst === null ? null : <OpenCameraScreen {...props} />;
}

function OpenCameraScreen({
  tripId,
  mode = null,
  fromSheet = false,
  recognize,
}: CameraScreenProps) {
  const { t, i18n } = useLingui();
  const names = useLanguageNames();
  const [order, setOrder] = useState<MenuOrder | null>(null);
  const context = useGuideContext(tripId);
  const trip = context.trip;
  const syncPhase = useSyncPhase();
  const [state, setState] = useState(MENU_AIMING);
  const camera = useMemo(() => (recognize === null ? null : menuCameraModule()), [recognize]);
  const capture = useRef<(() => Promise<string | null>) | null>(null);
  const controller = useRef<MenuScanController | null>(null);
  const live = useRef({ online: true, tripId: trip?.tripId ?? null });
  const online = syncPhase !== 'offline';
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
  const reading = state.reading;
  const tripParams = trip === null ? {} : { tripId: trip.tripId };
  const modeParams = mode === null ? {} : { mode };
  const askGuide = (question: string) => {
    const q = t({ id: 'guide.camera.askWithMenu', message: `${question} The menu: ${dishes}` });
    // The sheet the camera was opened from takes the question: back to it, not a second sheet.
    if (fromSheet && handToSheet(q)) {
      goBackOr();
      return;
    }
    const sheet = hrefFor('3j-1', { ...tripParams, ...modeParams, q });
    if (sheet !== undefined) router.replace(sheet);
  };
  const split = trip === null ? undefined : hrefFor('3i-2', tripParams);
  const voice = hrefFor('3j-2', { ...tripParams, ...modeParams });
  const crewSize = trip?.crewSize ?? 1;
  const leastSpicy = t({ id: 'guide.camera.leastSpicy', message: 'Least spicy?' });
  const orderFor =
    crewSize > 1
      ? t({ id: 'guide.camera.orderFor', message: `Order for ${crewSize}` })
      : t({ id: 'guide.camera.orderOne', message: 'Order' });
  const ordered = orderLines(stickers, order ?? {});
  const sourceLanguage = reading?.source_language ?? null;
  const showOrder = () => {
    const card = orderCard(ordered);
    // Without the menu's language the card is still shown; only its pronunciation hint is lost.
    router.push(showModeHref(card.phrase, sourceLanguage ?? 'und', card.gloss));
  };
  const splitOrder =
    typeof split !== 'string'
      ? undefined
      : () =>
          router.push({
            pathname: split,
            // The expense is for the trip whose menu this is.
            params: { ...tripParams, name: orderExpenseName(ordered) },
          });
  const followUps: MenuFollowUp[] = [
    {
      id: 'least-spicy',
      label: leastSpicy,
      onPress: () =>
        askGuide(
          t({ id: 'guide.camera.leastSpicyAsk', message: 'Which of these is the least spicy?' }),
        ),
    },
    { id: 'order', label: orderFor, onPress: () => setOrder({}) },
    ...(split === undefined
      ? []
      : [
          {
            id: 'split',
            label: t({ id: 'guide.camera.split', message: 'Split the bill' }),
            onPress: () =>
              router.push(
                typeof split === 'string' ? { pathname: split, params: tripParams } : split,
              ),
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
      languages={languagePair(names, sourceLanguage, i18n.locale)}
      {...(order === null
        ? {}
        : {
            order: (
              <MenuOrderCard
                guideName={context.guideName}
                crewSize={crewSize}
                stickers={stickers}
                order={order}
                onChange={(id, by) => setOrder((current) => changeOrder(current ?? {}, id, by))}
                onShow={showOrder}
                {...(splitOrder === undefined ? {} : { onSplit: splitOrder })}
                onAsk={() =>
                  askGuide(
                    t({
                      id: 'guide.camera.orderForAsk',
                      message: `What should we order for ${crewSize} people, and how do I say it?`,
                    }),
                  )
                }
                onClose={() => setOrder(null)}
              />
            ),
          })}
      onScan={() => void controller.current?.scan()}
      onRetake={() => {
        // Another menu starts another order.
        setOrder(null);
        controller.current?.retake();
      }}
      onAsk={askGuide}
      {...(voice === undefined ? {} : { onMic: () => router.push(voice) })}
      onClose={() => goBackOr()}
      onOpenSettings={() => void Linking.openSettings()}
    />
  );
}
