/**
 * "Vote on {n} ideas" counts the public board's ideas that still take votes, read over the api.
 */
import { describe, expect, it } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { TravelDataReaderProvider } from '@/data/travel-data/client';
import { recordedReader } from '@/data/travel-data/test-support/recorded-reader';

import { ideasToVote, useIdeasToVote } from '../data/help-local';

describe('ideas to vote on', () => {
  it('counts open, planned and building ideas, never shipped or declined ones', async () => {
    const reader = recordedReader({ '/v1/help/ideas': [200, 'ideas-board'] });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TravelDataReaderProvider value={reader}>{children}</TravelDataReaderProvider>
    );
    const { result } = await renderHook(() => useIdeasToVote(), { wrapper });
    await waitFor(() => expect(result.current).toBe(3));
  });

  it('reads an empty board as none, and a board it could not read as unknown', () => {
    expect(ideasToVote([])).toBe(0);
    expect(ideasToVote(undefined)).toBeNull();
  });
});
