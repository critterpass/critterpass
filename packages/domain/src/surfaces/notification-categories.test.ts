import { describe, expect, it } from 'vitest';

import { ACTION_KEY_SCOPES } from '../auth/action-key-scopes';
import { NOTIFICATION_CATEGORIES } from '../notifications';
import {
  NOTIFICATION_CATEGORY_SPECS,
  NOTIFICATION_VOTE_ACTIONS,
  notificationCategorySpec,
  renderCategoriesSwift,
} from './notification-categories';

describe('notification categories', () => {
  it('has exactly one row per category the router sends under', () => {
    expect(NOTIFICATION_CATEGORY_SPECS.map((spec) => spec.id)).toEqual([
      ...NOTIFICATION_CATEGORIES,
    ]);
  });

  it('gives every background action a command and every action a unique id in its category', () => {
    for (const spec of NOTIFICATION_CATEGORY_SPECS) {
      const ids = spec.actions.map((action) => action.id);
      expect(new Set(ids).size, spec.id).toBe(ids.length);
      for (const action of spec.actions) {
        if (!action.foreground) expect(action.command, `${spec.id} ${action.id}`).not.toBeNull();
        if (action.scope !== null) expect(ACTION_KEY_SCOPES).toContain(action.scope);
      }
    }
  });

  it('casts votes with the ballot scope from up to three buttons, then opens the app', () => {
    const vote = notificationCategorySpec('cp.vote');
    expect(vote.poster).toBe(true);
    expect(vote.actions.map((action) => action.id)).toEqual(['VOTE_1', 'VOTE_2', 'VOTE_3', 'OPEN']);
    expect(
      vote.actions.slice(0, NOTIFICATION_VOTE_ACTIONS).every((a) => a.scope === 'ballot'),
    ).toBe(true);
  });

  it('leaves OUT to the app, where its private reason is asked', () => {
    const rsvp = notificationCategorySpec('cp.rsvp');
    expect(rsvp.actions.map((action) => action.id)).toEqual(['IN', 'MAYBE', 'OPEN']);
  });

  it('renders Swift with every category and escapes quotes', () => {
    const swift = renderCategoriesSwift('// header');
    for (const id of NOTIFICATION_CATEGORIES) expect(swift).toContain(`id: "${id}"`);
    expect(swift).toContain('title: "I\'m up"');
    expect(swift).toContain('command: "cast_ballot", scope: "ballot"');
  });
});
