import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { CameraScreen, type CameraScreenProps } from '@/features/guide/camera/camera-screen';
import { threadModeOf } from '@/features/guide/chat/data/use-guide-thread';

import { getOcr } from '../../../../modules/cp-ocr';

/** The phone's text recognition as the menu camera uses it; null in a build without it. */
function deviceRecognizer(): CameraScreenProps['recognize'] {
  const ocr = getOcr();
  if (ocr === null) return null;
  return async (uri) => {
    const result = await ocr.recognize(uri);
    return {
      status: result.status,
      lines: result.lines.map((line) => ({ id: line.id, text: line.text, bbox: line.bbox })),
      width: result.width,
      height: result.height,
    };
  };
}

/**
 * Point and ask (3j-3): take a still of a menu and read it in your own language, with the crew's
 * dietary flags on the dishes. Opened from the guide sheet's TRANSLATE A MENU (`from: 'guide'`,
 * with the sheet's `mode`), a question about the menu goes back to that sheet.
 */
export default function CameraRoute() {
  const { tripId, mode, from } = useLocalSearchParams<{
    tripId?: string;
    mode?: string;
    from?: string;
  }>();
  const recognize = useMemo(() => deviceRecognizer(), []);
  return (
    <CameraScreen
      tripId={typeof tripId === 'string' && tripId !== '' ? tripId : null}
      mode={threadModeOf(mode) ?? null}
      fromSheet={from === 'guide'}
      recognize={recognize}
    />
  );
}
