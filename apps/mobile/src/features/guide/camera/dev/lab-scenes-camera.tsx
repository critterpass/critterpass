/**
 * Guide lab scenes for point and ask (3j-3) over a drawn menu: before a scan, reading, the menu
 * read with a clash and the crew's chips, a menu read with nobody's flags to check, and each way a
 * scan stops short (no camera, camera refused, no writing found, offline, questions spent, the
 * reading failed).
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@/ui';
import { guideSticker } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';
import { Hatch } from '@/ui/textures/hatch';

import { CameraView, type MenuFollowUp } from '../camera-view';
import {
  MENU_AIMING,
  type MenuLine,
  type MenuReading,
  type MenuScanState,
  type MenuStill,
} from '../menu-scan';

const noop = () => undefined;

export const MENU_STILL: MenuStill = { uri: 'lab://menu', width: 900, height: 720 };

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
      flags: [],
    },
    {
      ocr_line_id: 'l2',
      translation: 'Fresh spring rolls',
      description: 'Rice paper rolls with herbs',
      spice: 0,
      flags: [],
    },
    {
      ocr_line_id: 'l3',
      translation: 'Beef in betel leaf',
      description: 'Grilled minced beef wrapped in betel leaves',
      spice: 1,
      flags: [],
    },
    {
      ocr_line_id: 'l4',
      translation: 'Tofu, peanut sauce',
      description: 'Fried tofu in peanut sauce',
      spice: 0,
      flags: [
        { member: 'Linh', verdict: 'ok', reason: 'veg' },
        { member: 'Minh', verdict: 'clash', reason: 'peanuts' },
      ],
    },
  ],
  suggestion:
    'The tofu works for Linh, but it comes in peanut sauce, so skip it for Minh. The spring rolls suit everyone.',
  checked_members: ['Linh', 'Minh'],
};

const FOLLOW_UPS: readonly MenuFollowUp[] = [
  { id: 'least-spicy', label: 'Least spicy?', onPress: noop },
  { id: 'order', label: 'Order for 6', onPress: noop },
  { id: 'split', label: 'Split the bill', onPress: noop },
];

/** The menu as a sheet of paper, each line where its box says it is. */
function DrawnMenu() {
  const theme = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.color.paper.base }]}>
      {MENU_LINES.map((line) => (
        <View
          key={line.id}
          style={{
            position: 'absolute',
            left: `${line.bbox[0] * 100}%`,
            top: `${line.bbox[1] * 100}%`,
            width: `${line.bbox[2] * 100}%`,
          }}
        >
          <Text variant={line.id === 'l0' ? 'title' : 'bodyLg'} color={theme.color.paper.ink}>
            {line.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Scene({ state }: { readonly state: Partial<MenuScanState> }) {
  const theme = useTheme();
  const sticker = guideSticker('tokek');
  return (
    <CameraView
      guideName="Ngựa"
      sticker={<Sticker kind={sticker.kind} name={sticker.name} size={48} />}
      state={{ ...MENU_AIMING, ...state }}
      camera={<Hatch baseColor={theme.color.ink['930']} />}
      still={<DrawnMenu />}
      followUps={FOLLOW_UPS}
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
