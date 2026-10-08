/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';

import { tokens } from '@cp/design-tokens';

import { registerFixture } from '../gallery/registry';
import { Row } from '../layout/Row';
import { Text } from '../text/Text';
import { IdeaVoteBox } from './IdeaVoteBox';
import { ResultTally } from './ResultTally';

const { color } = tokens;

function IdeaDemo() {
  const [voted, setVoted] = useState(false);
  return (
    <Row gap="12" align="center">
      <IdeaVoteBox
        count={voted ? 413 : 412}
        voted={voted}
        onToggle={() => setVoted((v) => !v)}
        ideaTitle="Packing lists per crew"
      />
      <Text variant="title">Packing lists per crew</Text>
    </Row>
  );
}
registerFixture('ResultTally', 'Kyoto wins', () => (
  <ResultTally
    headline="Kyoto wins 4–2"
    rows={[
      { id: 'kyoto', name: 'Kyoto', votes: 4, color: color.orange, winner: true },
      { id: 'lisbon', name: 'Lisbon', votes: 2, color: color.green.base },
    ]}
  />
));
registerFixture('IdeaVoteBox', 'toggle', () => <IdeaDemo />);
