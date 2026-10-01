/**
 * One showdown half over fixture props: its chips are ink on every place colour (label and
 * outline alike, on the flat colour and over a photo), and the guide's line sits in a bubble beside
 * the guide's silhouette whenever the pitch has one.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
// Loops are timing, not layout: the tests see their resting frame.
jest.mock('@/motion/use-loop', () => ({ useLoop: () => ({}) }));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { contrastRatio, tokens } from '@cp/design-tokens';
import type { PitchSections } from '@cp/domain';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import type { GuideId } from '@/ui/people/GuideLine';
import { treatmentFor } from '@/ui/media/duotone';

import type { BoardPlace } from '../../data/use-board';
import type { PollOptionView } from '../../data/poll-view';
import { renderVote } from '../../test-support/vote-harness';
import { ShowdownHalf } from '../showdown-half';

let stack: TestLocalFirst | null = null;

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  return stack;
}

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

/** One showdown half over fixture props: a place in `colour` whose pitch has chips and maybe a line. */
function Half({
  colour,
  guide,
  quote,
}: {
  readonly colour: string;
  readonly guide: GuideId;
  readonly quote: string | null;
}) {
  const place: BoardPlace = { id: 'p-1', name: 'Kyoto', guide, colour, coverage: 'live' };
  const option: PollOptionView = {
    id: 'o-1',
    label: 'Kyoto',
    refId: 'p-1',
    pitchId: 'pitch-1',
    proposedBy: null,
    votes: 2,
    voterIds: [],
    mine: false,
    winner: false,
  };
  const sections: PitchSections = {
    sticker: { place_id: 'p-1', name: 'Kyoto', country: null, coverage: 'live', guide: 'pon' },
    headline: null,
    chips: [
      { kind: 'flight', minutes: 16 * 60, origin: 'SIN' },
      { kind: 'price', amount_minor: 192_000, currency: 'USD', origin: 'SIN' },
      { kind: 'best_months', months: [4] },
    ],
    reasons: [],
    quote,
    alternatives: [],
  };
  return (
    <ShowdownHalf
      option={option}
      place={place}
      people={new Map()}
      sectionsOf={new Map([['pitch-1', sections]])}
      alignEnd={false}
      onVote={undefined}
      squashKey={0}
      edgeInset={0}
      nameScale={1}
      nameHidden={false}
      onRest={() => undefined}
      onNameMeasure={() => undefined}
    />
  );
}

describe('showdown half', () => {
  it('sets every chip in ink on every place colour, like its outline', async () => {
    const s = await open();
    const ink = tokens.color.ink['850'];
    for (const [index, guide] of tokens.guide.order.entries()) {
      const colour = tokens.guide[guide];
      const view = await renderVote(<Half colour={colour} guide={guide} quote="A line." />, s);
      const label = screen.getByText('16H FLIGHT');
      const text = StyleSheet.flatten(label.props.style as StyleProp<TextStyle>);
      const pill = StyleSheet.flatten(label.parent?.props.style as StyleProp<ViewStyle>);
      expect(text?.color).toBe(ink);
      expect(pill?.borderColor).toBe(ink);
      // On the flat colour and on the darkest tone its photo takes.
      expect(contrastRatio(ink, colour)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(ink, treatmentFor('accent', colour, ink).shadow)).toBeGreaterThanOrEqual(
        4.5,
      );
      await view.unmount();
      expect(index).toBeLessThan(tokens.guide.order.length);
    }
  });

  it("shows the guide's line in a bubble beside the guide's silhouette, when the pitch has one", async () => {
    const s = await open();
    const view = await renderVote(
      <Half colour={tokens.guide.pon} guide="pon" quote="Come in April." />,
      s,
    );
    expect(screen.getByTestId('showdown-quote-0')).toHaveTextContent('Come in April.');
    expect(screen.getByTestId('showdown-guide-0', { includeHiddenElements: true })).toBeTruthy();
    await view.unmount();
    // A pitch still streaming has no line yet: no empty bubble, the silhouette stays.
    await renderVote(<Half colour={tokens.guide.pon} guide="pon" quote={null} />, s);
    expect(screen.queryByTestId('showdown-quote-0')).toBeNull();
    expect(screen.getByTestId('showdown-guide-0', { includeHiddenElements: true })).toBeTruthy();
  });
});
