import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, jest } from '@jest/globals';
import type { NotificationAction } from 'expo-notifications';

jest.mock('expo-notifications', () => ({ setNotificationCategoryAsync: jest.fn() }));

import { CATEGORIES_SWIFT_FILE, renderCategoriesSwift } from '@cp/domain';

import { APP_REGISTERED_CATEGORIES, registerNotificationCategories } from '../categories';

describe('registerNotificationCategories', () => {
  it('registers the poster and generic categories with background vote and RSVP buttons', async () => {
    const written = new Map<string, NotificationAction[]>();
    await registerNotificationCategories(
      (_category, action) => action.title,
      (id, actions) => {
        written.set(id, actions);
        return Promise.resolve();
      },
    );

    expect([...written.keys()]).toEqual([...APP_REGISTERED_CATEGORIES]);
    expect(written.get('cp.vote')).toEqual([
      { identifier: 'VOTE_1', buttonTitle: 'Option 1', options: background },
      { identifier: 'VOTE_2', buttonTitle: 'Option 2', options: background },
      { identifier: 'VOTE_3', buttonTitle: 'Option 3', options: background },
      {
        identifier: 'OPEN',
        buttonTitle: 'Open',
        options: { ...background, opensAppToForeground: true },
      },
    ]);
    expect(written.get('cp.rsvp')?.map((action) => action.identifier)).toEqual([
      'IN',
      'MAYBE',
      'OPEN',
    ]);
  });

  it('gives the chat reply a text field and keeps mark-read a plain background button', async () => {
    const written = new Map<string, NotificationAction[]>();
    await registerNotificationCategories(
      (_category, action) => action.title,
      (id, actions) => {
        written.set(id, actions);
        return Promise.resolve();
      },
    );
    expect(written.get('cp.chat')).toEqual([
      {
        identifier: 'REPLY',
        buttonTitle: 'Reply',
        textInput: { submitButtonTitle: 'Reply', placeholder: '' },
        options: background,
      },
      { identifier: 'READ', buttonTitle: 'Mark read', options: background },
    ]);
  });

  it('does not register the categories whose buttons differ from push to push', () => {
    for (const varying of ['cp.money', 'cp.disruption', 'cp.briefing']) {
      expect(APP_REGISTERED_CATEGORIES).not.toContain(varying);
    }
  });

  it('leaves the categories a feature answers to that feature', () => {
    for (const owned of ['cp.changeset', 'cp.leaveby', 'cp.sos', 'cp.help', 'cp.setup_ask']) {
      expect(APP_REGISTERED_CATEGORIES).not.toContain(owned);
    }
  });

  it('keeps registering the rest when one category is refused', async () => {
    const ids: string[] = [];
    await registerNotificationCategories(
      (_category, action) => action.title,
      (id) => {
        ids.push(id);
        return id === 'cp.vote' ? Promise.reject(new Error('refused')) : Promise.resolve();
      },
    );
    expect(ids).toEqual([...APP_REGISTERED_CATEGORIES]);
  });
});

describe('Categories.swift', () => {
  it('matches the domain table (regenerate: packages/domain/scripts/gen-categories-swift.ts)', () => {
    const repo = path.resolve(__dirname, '../../../../../..');
    expect(readFileSync(path.join(repo, CATEGORIES_SWIFT_FILE), 'utf8')).toBe(
      renderCategoriesSwift(),
    );
  });
});

const background = {
  opensAppToForeground: false,
  isAuthenticationRequired: false,
  isDestructive: false,
};
