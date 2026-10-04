/**
 * Copies the README's curated design screens from `docs/design-renders/screens/` as resized JPEGs into
 * `docs/assets/readme/screens/`, and rewrites the gallery between `<!-- screens:start -->` and
 * `<!-- screens:end -->` in the README: one table, a heading row per flow, four screens per row.
 *
 *   pnpm tsx tools/scripts/readme/screens.ts
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { createCanvas, loadImage } from '../review-canvas';
import { replaceSection } from './render';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const SOURCE = path.join(REPO_ROOT, 'docs/design-renders/screens');
const OUT_DIR = 'docs/assets/readme/screens';
const WIDTH = 360;
const QUALITY = 82;
const CELL_WIDTH = 190;

/** Design screen labels (file names without `.png`), grouped by flow, four per flow. */
export const GALLERY: readonly { flow: string; screens: readonly string[] }[] = [
  {
    flow: 'Onboarding',
    screens: [
      '3a-1_Splash',
      '3a-4_This_or_that',
      '3a-6_Pass_issued',
      '3a-10_Invite_a_seat_for_you',
    ],
  },
  {
    flow: 'Home',
    screens: ['3b-1_Home_first_run', '3b-2_Home', '3b-4_Inbox', '3b-6_Home_final_vote'],
  },
  {
    flow: 'Crew chat',
    screens: ['3g-1_Crew_chat', '3g-2_Live_collab', '3g-3_Crews', '3g-4_Crew_map'],
  },
  {
    flow: 'Vote',
    screens: ['3b-3_Pitch_a_place', '7g-2_Swipe_together', '3c-1_Vote_showdown', '3c-2_Kyoto_wins'],
  },
  { flow: 'Trip setup', screens: ['3c-3_When', '3c-5_Budget', '3c-6_Rooms', '3c-7_Must-dos'] },
  {
    flow: 'Drafting',
    screens: [
      '3c-8_Pon_is_drafting',
      '3c-9_Pon_s_draft',
      '3c-11_Change_a_day',
      '3c-12_Pon_s_redraft',
    ],
  },
  {
    flow: 'Money',
    screens: ['3i-1_Balances', '3i-2_Add_an_expense', '3i-3_Scan_a_receipt', '3i-5_Settle_up'],
  },
  {
    flow: 'Bookings',
    screens: ['3h-1_Bookings', '3h-2_Add_a_booking', '4a-2_Boarding_pass', '3h-3_Getting_around'],
  },
  {
    flow: 'Plan',
    screens: ['7a-1_Trip_map', '7b-1_Day_plan', '7e-1_Place_detail', '3f-2_Proposal_trailer'],
  },
];

/** `3c-9_Pon_s_draft` → `Pon's draft`. */
export function caption(label: string): string {
  return label
    .replace(/^[^_]+_/, '')
    .replace(/_s_/g, "'s ")
    .replace(/_/g, ' ');
}

interface JpegCanvas {
  getContext(kind: '2d'): {
    drawImage(image: unknown, x: number, y: number, w: number, h: number): void;
  };
  encode(format: 'jpeg', quality: number): Promise<Buffer>;
}

async function writeScreen(label: string): Promise<number> {
  const image = await loadImage(readFileSync(path.join(SOURCE, `${label}.png`)));
  const height = Math.round((image.height / image.width) * WIDTH);
  const canvas = createCanvas(WIDTH, height) as unknown as JpegCanvas;
  canvas.getContext('2d').drawImage(image, 0, 0, WIDTH, height);
  const file = path.join(REPO_ROOT, OUT_DIR, `${label}.jpg`);
  writeFileSync(file, await canvas.encode('jpeg', QUALITY));
  return statSync(file).size;
}

function gallery(): string {
  const rows = GALLERY.flatMap(({ flow, screens }) => [
    `<tr><th colspan="4" align="left">${flow}</th></tr>`,
    '<tr>',
    ...screens.map(
      (label) =>
        `<td align="center"><img src="${OUT_DIR}/${label}.jpg" width="${CELL_WIDTH}" alt="${caption(label)}"><br><sub>${caption(label)}</sub></td>`,
    ),
    '</tr>',
  ]);
  return ['<table>', ...rows, '</table>'].join('\n');
}

mkdirSync(path.join(REPO_ROOT, OUT_DIR), { recursive: true });
let bytes = 0;
for (const { screens } of GALLERY) for (const label of screens) bytes += await writeScreen(label);
const readmePath = path.join(REPO_ROOT, 'README.md');
writeFileSync(
  readmePath,
  replaceSection(
    readFileSync(readmePath, 'utf8'),
    gallery(),
    '<!-- screens:start -->',
    '<!-- screens:end -->',
  ),
);
console.log(`README screens: ${GALLERY.length * 4} images, ${Math.round(bytes / 1024)} KB`);
