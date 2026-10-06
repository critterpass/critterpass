import { describe, expect, it } from 'vitest';

import { canMoveIdea, setIdeaStatusPayloadSchema } from './ideas';

const id = '0192f3a4-7c1e-7000-8000-000000000001';

describe('canMoveIdea', () => {
  it('lets a suggestion only be published or declined', () => {
    expect(canMoveIdea('pending_review', 'open')).toBe(true);
    expect(canMoveIdea('pending_review', 'declined')).toBe(true);
    expect(canMoveIdea('pending_review', 'planned')).toBe(false);
    expect(canMoveIdea('pending_review', 'shipped')).toBe(false);
  });

  it('keeps shipped and merged final and lets a declined idea reopen', () => {
    expect(canMoveIdea('shipped', 'open')).toBe(false);
    expect(canMoveIdea('merged', 'open')).toBe(false);
    expect(canMoveIdea('declined', 'open')).toBe(true);
    expect(canMoveIdea('declined', 'planned')).toBe(false);
    expect(canMoveIdea('open', 'open')).toBe(false);
  });
});

describe('set_idea_status payload', () => {
  it('needs a version to ship and something to change', () => {
    expect(setIdeaStatusPayloadSchema.safeParse({ idea_id: id, status: 'shipped' }).success).toBe(
      false,
    );
    expect(
      setIdeaStatusPayloadSchema.safeParse({
        idea_id: id,
        status: 'shipped',
        fixed_in_version: '1.0.4',
      }).success,
    ).toBe(true);
    expect(setIdeaStatusPayloadSchema.safeParse({ idea_id: id }).success).toBe(false);
    expect(setIdeaStatusPayloadSchema.safeParse({ idea_id: id, team_note: null }).success).toBe(
      true,
    );
  });
});
