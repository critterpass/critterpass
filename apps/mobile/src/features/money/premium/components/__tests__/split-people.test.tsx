// The shared Reanimated stand-in has no `ReduceMotion`, which the premium springs read at import.
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual<Record<string, unknown>>('react-native-reanimated'),
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';

import { renderWithI18n } from '@/lib/i18n/testing';
import { PremiumThemeProvider } from '@/ui/premium';

import type { MoneyMember } from '../../../data/context';
import { newDraft, sharesByMember, type ExpenseDraft } from '../../../add-expense/draft';
import { SplitPeople } from '../SplitPeople';

const MEMBERS: readonly MoneyMember[] = [
  { userId: 'u-an', name: 'An', joinIndex: 0, active: true },
  { userId: 'u-binh', name: 'Bình', joinIndex: 1, active: true },
];

/** Rp 450,000 split one share to three, in a crew that keeps its money in SGD. */
const DRAFT: ExpenseDraft = {
  ...newDraft({ currency: 'IDR', payerId: 'u-an', memberIds: ['u-an', 'u-binh'] }),
  digits: '450000',
  mode: 'weights',
  weights: { 'u-an': 1, 'u-binh': 3 },
};

describe('SplitPeople by share', () => {
  it("shows each share in the expense's own currency, not the crew's", async () => {
    await renderWithI18n(
      <PremiumThemeProvider>
        <SplitPeople
          draft={DRAFT}
          members={MEMBERS}
          perMember={sharesByMember(DRAFT)}
          onToggle={() => undefined}
          onStep={() => undefined}
          onFocus={() => undefined}
        />
      </PremiumThemeProvider>,
      { locale: 'en' },
    );
    expect(screen.queryAllByText(/S\$/)).toHaveLength(0);
    expect(screen.getAllByText(/Rp/)).toHaveLength(2);
  });
});
