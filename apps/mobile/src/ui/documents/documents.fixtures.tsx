/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';

import { tokens } from '@cp/design-tokens';

import { registerFixture } from '../gallery/registry';
import { Icon } from '../icons/Icon';
import { Stack } from '../layout/Stack';
import { Sticker } from '../sticker/Sticker';
import { GiftCard } from './GiftCard';
import { mrzLine } from './mrz';
import { PaperChrome } from './PaperChrome';
import { PassportCover } from './PassportCover';
import { PassportPage } from './PassportPage';
import { Receipt } from './Receipt';
import type { Signature } from './SignatureLayer';
import { SignatureLayer } from './SignatureLayer';
import { Stamp } from './Stamp';
import { Ticket } from './Ticket';
import { Visa } from './Visa';

const { color } = tokens;

const MRZ = [
  mrzLine(['P', 'SGP', 'WINSTON']),
  mrzLine(['CP0427', 'SGP', 'SUNRISE', 'FOOD', 'EASY']),
];

function Signing() {
  const [value, setValue] = useState<Signature | null>(null);
  return <SignatureLayer name="Winston Tan" value={value} onChange={setValue} />;
}

registerFixture('PassportPage', 'pass issued (3a-6)', () => (
  <PassportPage
    headStart="Critterpass · Passeport"
    headEnd="CP-0427"
    photo={<Sticker kind="axolotl" name="Winston" size={80} />}
    fields={[
      { key: 'name', label: 'Given name · Prénom', value: 'Winston' },
      { key: 'home', label: 'Home', value: 'Singapore · SG' },
      { key: 'issued', label: 'Issued', value: '26 Sep 2026' },
      { key: 'style', label: 'Travel style', value: 'Sunrise · Street food · Easy' },
    ]}
    stamps={<Stamp title="SIN" top="Home" ink={color.orange} slam />}
    mrz={MRZ}
    accessibilityLabel="Passport of Winston, home Singapore, issued 26 September 2026, 1 stamp"
  />
));
registerFixture('PassportCover', 'ink and gold', () => (
  <Stack gap="16">
    <PassportCover
      title="Critterpass"
      mark="Passport"
      subtitle="Passport · Passeport · Pasaporte"
      emblem={<Sticker kind="gecko" name="Tokek" size={110} />}
      accessibilityLabel="Critterpass passport cover"
    />
    <PassportCover
      variant="gold"
      title="Critterpass"
      mark="Plus"
      subtitle="Winston · 7 trips"
      emblem={<Sticker kind="gecko" name="Tokek" size={100} />}
      accessibilityLabel="Critterpass Plus cover, Winston, 7 trips"
    />
  </Stack>
));
registerFixture('PaperChrome', 'visa page', () => (
  <PaperChrome
    headStart="Visas · Visas · Visas"
    headEnd="Page 07"
    texture="engraving"
    mrz={[mrzLine(['P', 'SGP', 'CRITTERPASS', 'WINSTON'])]}
    accessibilityLabel="Visa page 7"
  >
    <Visa
      kind="passPlus"
      eyebrow="Visa · For you · Pour vous"
      title="Pass+"
      price="$29.99"
      period="A year · $2.50/mo"
      photo={<Icon name="star" size={40} decorative />}
      fields={[
        { key: 'holder', label: 'Holder', value: 'Winston' },
        { key: 'entries', label: 'Entries', value: 'Unlimited' },
        { key: 'valid', label: 'Valid', value: '12 months' },
        { key: 'works', label: 'Works in', value: 'Every crew' },
      ]}
      perk="Guide chat, voice and camera without limits. Every icon style."
      mrz={mrzLine(['V', 'CPPASS', 'PLUS', 'WINSTON'])}
      accessibilityLabel="Pass+ visa, $29.99 a year, holder Winston"
    />
    <Visa
      kind="boost"
      eyebrow="Entry · For the crew"
      title="Trip boost · $12"
      perk="Redrafts, live map, crews of 16."
      accessibilityLabel="Trip boost entry stamp, $12 for the crew"
    />
  </PaperChrome>
));
registerFixture('Stamp', 'round, rect, pending', () => (
  <Stack gap="16" align="center">
    <Stamp title="SIN" top="Home" ink={color.orange} />
    <Stamp title="Paid" top="Balances" bottom="In full" ink={color.green.deep} tilt={12} />
    <Stamp shape="rect" title="DPS" top="Bali" bottom="Oct 12" ink={color.yellow} />
    <Stamp shape="pending" title="?" top="Next" ink={color.ink[300]} />
  </Stack>
));
registerFixture('Ticket', 'crew boarding pass (3f-5)', () => (
  <Ticket
    headStart="Critterpass Air"
    headEnd="Gate: yes"
    from={{ code: 'SIN' }}
    to={{ code: 'KIX' }}
    fields={[
      { key: 'p', label: 'Passenger', value: 'Rin Sato' },
      { key: 's', label: 'Seat', value: 'Window, by Maya' },
      { key: 'd', label: 'Dates', value: 'Apr 2–9' },
      { key: 'y', label: 'Your share', value: '$1,310' },
    ]}
    sticker={<Sticker kind="tanuki" name="Pon" size={64} />}
    stubText="Boarding group: The Bali Six"
    stubEnd="A07"
    accessibilityLabel="Boarding pass, Singapore to Osaka Kansai, Rin Sato, Apr 2 to 9, your share $1,310"
  />
));
registerFixture('Ticket', 'flight', () => (
  <Ticket
    kind="flight"
    headStart="SQ 938 · Mon 12 Oct"
    headEnd="On time"
    from={{ code: 'SIN', time: '09:05' }}
    to={{ code: 'DPS', time: '11:40' }}
    fields={[
      { key: 'b', label: 'Boards', value: '08:25' },
      { key: 'g', label: 'Gate', value: 'B7' },
      { key: 's', label: 'Seat', value: '34A' },
      { key: 'k', label: 'Bag', value: '23kg' },
    ]}
    stubText="Maya and Alex are on this flight"
    accessibilityLabel="Flight SQ 938, Singapore 09:05 to Denpasar 11:40, gate B7, seat 34A"
  />
));
registerFixture('Receipt', 'money wrapped (3m-6)', () => (
  <Receipt
    art={<Icon name="wallet" size={40} decorative />}
    title="The Bali Six"
    subtitle="Oct 12–19 · 6 guests"
    sections={[
      [
        { key: 's', label: 'Stays', amount: '$2,820' },
        { key: 'f', label: 'Food · 61 meals', amount: '$1,284', highlight: true },
        { key: 't', label: 'Transit · made', amount: '$1,016' },
      ],
      [
        { key: 'total', label: 'Total', amount: '$6,980', emphasis: true },
        { key: 'each', label: 'Each', amount: '$1,163', emphasis: true },
      ],
    ]}
    note="Everyone's square. Nobody owes anybody."
    stamp={<Stamp title="Paid" top="Balances" bottom="In full" ink={color.green.deep} size={88} />}
    footer="Thank you · Terima kasih"
    accessibilityLabel="Receipt for the Bali Six, total $6,980, $1,163 each, balances paid in full"
  />
));
registerFixture('GiftCard', 'pass+ gift', () => (
  <GiftCard
    title="Pass+ · 1 year"
    from="From Maya"
    message="For the next one!"
    code="ab12cd34ef56"
    art={<Icon name="heart" size={44} decorative />}
    accessibilityLabel="Gift card, Pass+ for 1 year, from Maya"
  />
));
registerFixture('SignatureLayer', 'draw or type', () => <Signing />);
