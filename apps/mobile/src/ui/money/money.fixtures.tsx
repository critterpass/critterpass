/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';

import { registerFixture } from '../gallery/registry';
import { Stack } from '../layout/Stack';
import { Face } from '../plan/plan.fixtures';
import { Amount } from './Amount';
import { PayMethodChips } from './PayMethodChips';
import { SettleRow } from './SettleRow';

const noop = () => undefined;
const winston = { name: 'Winston', avatar: <Face initial="W" index={5} /> };

function MethodsDemo() {
  const [selected, setSelected] = useState<readonly string[]>(['bank']);
  return (
    <PayMethodChips
      methods={[
        { id: 'bank', label: 'Bank transfer' },
        { id: 'paynow', label: 'PayNow' },
        { id: 'cash', label: 'Cash' },
      ]}
      selected={selected}
      onToggle={(id) =>
        setSelected((list) => (list.includes(id) ? list.filter((m) => m !== id) : [...list, id]))
      }
    />
  );
}

registerFixture('Amount', 'a column that lines up, in row, card and hero type', () => (
  <Stack gap="16">
    <Stack gap="4" align="flex-end">
      <Amount variant="rowTitle">$1,111.11</Amount>
      <Amount variant="rowTitle">$92.10</Amount>
      <Amount variant="rowTitle">$408.77</Amount>
      <Amount variant="rowTitle">$1,000.00</Amount>
    </Stack>
    <Stack gap="4" align="flex-end">
      <Amount variant="h3">Rp 1.111.111</Amount>
      <Amount variant="h3">Rp 450.000</Amount>
    </Stack>
    <Amount variant="displayXl">$1,411.87</Amount>
  </Stack>
));
registerFixture('SettleRow', 'three states', () => (
  <Stack gap="8">
    <SettleRow
      from={{ name: 'Jordan', avatar: <Face initial="J" index={0} /> }}
      to={winston}
      amount="$92.10"
      status="requested"
      statusLabel="Requested"
      onNudge={noop}
    />
    <SettleRow
      from={{ name: 'Alex', avatar: <Face initial="A" index={2} /> }}
      to={winston}
      amount="$94.30"
      status="paid"
      statusLabel="Paid ✓"
    />
    <SettleRow
      from={{ name: 'Rin', avatar: <Face initial="R" index={3} /> }}
      to={{ name: 'Maya', avatar: <Face initial="M" index={1} /> }}
      amount="$41.00"
      status="pending"
      statusLabel="Pending"
    />
  </Stack>
));
registerFixture('PayMethodChips', 'how people pay you', () => <MethodsDemo />);
