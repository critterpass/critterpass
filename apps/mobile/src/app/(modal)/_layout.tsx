import { Stack } from 'expo-router/js-stack';

import { modalGroupOptions } from '@/lib/navigation/transitions';

/**
 * Sheets and rise modals (screens owned by their areas). Each screen is a transparent card that
 * keeps the one below rendered; `Sheet` / `RiseModal` run their own entrance, drag and dismiss.
 */
export default function ModalLayout() {
  return <Stack screenOptions={modalGroupOptions()} />;
}
