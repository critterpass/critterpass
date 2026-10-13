/**
 * Point and ask over a drawn menu, for the camera suites: the menu's lines and its reading, and
 * the premium camera page in each state a scan goes through (aiming, reading, read with a clash,
 * the order card open, read with nobody's flags, and each way a scan stops short).
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, never copy. */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PremiumCameraScene } from '../../premium/camera/camera-scene';
import type { MenuFollowUp } from '../camera-view-props';
import {
  MENU_AIMING,
  menuStickers,
  type MenuOrder,
  type MenuLine,
  type MenuReading,
  type MenuScanState,
  type MenuStill,
} from '../menu-scan';

const noop = () => undefined;

export const MENU_STILL: MenuStill = { uri: 'test://menu', width: 900, height: 720 };
export const MENU_LINES: readonly MenuLine[] = [
  { id: 'l0', text: 'QUÁN BÀ NĂM', bbox: [0.2, 0.08, 0.6, 0.1] },
  { id: 'l1', text: 'Bánh xèo 45k', bbox: [0.08, 0.26, 0.84, 0.09] },
  { id: 'l2', text: 'Gỏi cuốn 30k', bbox: [0.08, 0.42, 0.84, 0.09] },
  { id: 'l3', text: 'Bò lá lốt 60k', bbox: [0.08, 0.58, 0.84, 0.09] },
  { id: 'l4', text: 'Đậu hũ sốt đậu phộng 35k', bbox: [0.08, 0.74, 0.84, 0.09] },
];

export const MENU_READING: MenuReading = {
  status: 'ok',
  items: [
    {
      ocr_line_id: 'l1',
      translation: 'Crispy rice pancake',
      description: 'Turmeric pancake with prawns and bean sprouts',
      spice: 0,
      price: { printed: '45k', amountMinor: 45000, currency: 'VND' },
      flags: [],
    },
    {
      ocr_line_id: 'l2',
      translation: 'Fresh spring rolls',
      description: 'Rice paper rolls with herbs',
      spice: 0,
      price: { printed: '30k', amountMinor: 30000, currency: 'VND' },
      flags: [],
    },
    {
      ocr_line_id: 'l3',
      translation: 'Beef in betel leaf',
      description: 'Grilled minced beef wrapped in betel leaves',
      spice: 1,
      price: { printed: '60k', amountMinor: 60000, currency: 'VND' },
      flags: [],
    },
    {
      ocr_line_id: 'l4',
      translation: 'Tofu, peanut sauce',
      description: 'Fried tofu in peanut sauce',
      spice: 0,
      price: { printed: '35k', amountMinor: 35000, currency: 'VND' },
      flags: [
        { member: 'Linh', verdict: 'ok', reason: 'veg' },
        { member: 'Minh', verdict: 'clash', reason: 'peanuts' },
      ],
    },
  ],
  suggestion:
    'The tofu works for Linh, but it comes in peanut sauce, so skip it for Minh. The spring rolls suit everyone.',
  checked_members: ['Linh', 'Minh'],
  source_language: 'vi',
};

const FOLLOW_UPS: readonly MenuFollowUp[] = [
  { id: 'least-spicy', label: 'Least spicy?', onPress: noop },
  { id: 'order', label: 'Order for 6', onPress: noop },
  { id: 'split', label: 'Split the bill', onPress: noop },
];

function Scene({
  state,
  order,
}: {
  readonly state: Partial<MenuScanState>;
  readonly order?: MenuOrder;
}) {
  return (
    <PremiumCameraScene
      guideName="Ngựa"
      sticker={null}
      state={{ ...MENU_AIMING, ...state }}
      camera={null}
      still={<View />}
      followUps={FOLLOW_UPS}
      languages={state.reading == null ? null : 'Vietnamese → English'}
      {...(order === undefined
        ? {}
        : {
            order: {
              guideName: 'Ngựa',
              crewSize: 6,
              stickers: menuStickers(MENU_LINES, MENU_READING),
              order,
              onChange: noop,
              onShow: noop,
              onSplit: noop,
              onAsk: noop,
              onClose: noop,
            },
          })}
      onScan={noop}
      onRetake={noop}
      onAsk={noop}
      onMic={noop}
      onClose={noop}
      onOpenSettings={noop}
    />
  );
}

const READ = { still: MENU_STILL, lines: MENU_LINES };

export const CAMERA_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'camera-aiming': () => <Scene state={{}} />,
  'camera-reading': () => <Scene state={{ ...READ, phase: 'reading' }} />,
  'camera-menu': () => <Scene state={{ ...READ, phase: 'result', reading: MENU_READING }} />,
  'camera-order': () => (
    <Scene state={{ ...READ, phase: 'result', reading: MENU_READING }} order={{ l1: 2, l2: 1 }} />
  ),
  'camera-menu-no-flags': () => (
    <Scene
      state={{
        ...READ,
        phase: 'result',
        reading: {
          ...MENU_READING,
          items: MENU_READING.items.map((item) => ({ ...item, flags: [] })),
          suggestion: null,
          checked_members: [],
        },
      }}
    />
  ),
  'camera-no-camera': () => <Scene state={{ issue: 'no_camera' }} />,
  'camera-denied': () => <Scene state={{ issue: 'camera_denied' }} />,
  'camera-no-text': () => <Scene state={{ issue: 'no_text' }} />,
  'camera-offline': () => <Scene state={{ ...READ, phase: 'result', issue: 'offline' }} />,
  'camera-quota': () => <Scene state={{ ...READ, phase: 'result', issue: 'quota' }} />,
  'camera-failed': () => <Scene state={{ ...READ, phase: 'result', issue: 'failed' }} />,
};
