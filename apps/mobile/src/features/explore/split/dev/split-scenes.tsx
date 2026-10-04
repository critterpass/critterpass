/**
 * Lab scenes for crew can't agree (7e-3): Pura Lempuyang split 2–2 with two silent, each person's
 * own words and the guide's two ways; the same with no ways yet. Choosing works; nothing is sent.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';

import { guideFor } from '../../format';
import { fromStayLabel, splitCountLabel } from '../../place-detail/model';
import {
  optionTags,
  silentLine,
  suggestPost,
  votePost,
  type SplitOptionView,
} from '../split-model';
import { SplitView } from '../split-view';
import { StancePicker } from '../stance-picker';

const M = { key: 'm', name: 'Maya', joinIndex: 1 };
const J = { key: 'j', name: 'Jordan', joinIndex: 0 };
const A = { key: 'a', name: 'Alex', joinIndex: 2 };
const D = { key: 'd', name: 'Dee', joinIndex: 4 };

const OPTIONS: readonly SplitOptionView[] = [
  {
    optionId: 'keen1',
    kind: 'split_group',
    title: 'Keen ones go early',
    body: 'Maya and Jordan leave Sat at 04:30 with Made and are back by 13:00. Everyone else sleeps in.',
    attendeeIds: ['m', 'j'],
    goingCount: 2,
    cost: { minor: 450000, currency: 'IDR', per: 'car' },
  },
  {
    optionId: 'alt1',
    kind: 'alternative',
    title: 'Tirta Gangga instead',
    body: 'Same drive, a water palace, no queue. Everyone goes Sunday morning.',
    attendeeIds: [],
    goingCount: 6,
    cost: null,
  },
];

function Scene({ options }: { readonly options: readonly SplitOptionView[] }) {
  const { t, i18n } = useLingui();
  const [chosen, setChosen] = useState(0);
  const suggest = suggestPost(options, chosen);
  const vote = votePost(options);
  return (
    <SplitView
      name="Pura Lempuyang"
      meta={['East Bali', fromStayLabel(140, 'Villa Sayan')]}
      splitLabel={splitCountLabel(2, 2)}
      guide={guideFor('tokek')}
      want={[M, J]}
      ratherNot={[A, D]}
      silent={silentLine(
        ['r', 'me'],
        'me',
        (uid) => (uid === 'r' ? 'Rin' : uid),
        (names) => format.list(i18n.locale, [...names]),
      )}
      wantNotes={[
        { member: M, note: 'It’s the one photo my mum asked for.' },
        { member: J, note: 'I’ll queue. I’m built for queues.' },
      ]}
      ratherNotNotes={[
        { member: A, note: 'Five hours in a car for a queue?' },
        { member: D, note: 'Only if there’s breakfast after.' },
      ]}
      picker={
        <StancePicker mine={null} busy={false} onSay={() => undefined} onClear={() => undefined} />
      }
      options={options.map((option) => ({
        title: option.title,
        body: option.body,
        tags: optionTags(option, 6, i18n.locale),
      }))}
      optionsNote={
        options.length === 0
          ? t({
              id: 'explore.split.noWays',
              message: 'No way out yet. Say where you stand and I’ll look again.',
            })
          : null
      }
      chosen={chosen}
      onChoose={setChosen}
      suggest={suggest === null ? null : { label: suggest.label, onPress: () => undefined }}
      vote={vote === null ? null : { label: vote.label, onPress: () => undefined }}
      posting={false}
      onBack={() => undefined}
    />
  );
}

export const SPLIT_SCENES: Readonly<Record<string, () => ReactNode>> = {
  split: () => <Scene options={OPTIONS} />,
  'split-no-ways': () => <Scene options={[]} />,
};
