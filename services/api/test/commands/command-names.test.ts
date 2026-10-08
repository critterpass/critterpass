/**
 * The app types every command it sends with `COMMAND_NAMES` from `@cp/domain`, so that list has to
 * be exactly what the api registers: a name only in the list would compile in the app and answer
 * "unknown command" at the door; a command only in the registry could not be sent by the app.
 */
import { COMMAND_NAMES, commandNameSchema } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { buildFullCommandRegistry } from './full-registry';

describe('command names shared with the app', () => {
  const registered = buildFullCommandRegistry().names();
  const listed: readonly string[] = COMMAND_NAMES;

  it('lists every command the api registers', () => {
    expect(registered.filter((name) => !listed.includes(name))).toEqual([]);
  });

  it('lists no command the api does not register', () => {
    expect(listed.filter((name) => !registered.includes(name))).toEqual([]);
  });

  it('lists each name once, sorted, in the wire format', () => {
    expect(listed).toEqual([...new Set(listed)].sort());
    expect(listed.filter((name) => !commandNameSchema.safeParse(name).success)).toEqual([]);
  });
});
