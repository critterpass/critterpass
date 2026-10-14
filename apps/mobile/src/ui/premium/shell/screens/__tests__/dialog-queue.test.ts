import { describe, expect, it } from '@jest/globals';

import { createDialogQueue, type DialogSpec } from '../dialog-queue';

const confirm: DialogSpec = {
  kind: 'confirm',
  title: 'Remove Dev?',
  message: 'His seat opens.',
  confirm: 'Remove Dev',
  cancel: 'Keep Dev',
  destructive: true,
};

describe('dialog queue', () => {
  it('leaves the caller to the system alert while no host can draw it', () => {
    expect(createDialogQueue().show(confirm)).toBeNull();
  });

  it('resolves the confirm action as true and a way back as false', async () => {
    const queue = createDialogQueue();
    queue.attach();
    const first = queue.show(confirm);
    const shown = queue.current();
    expect(shown?.spec).toBe(confirm);
    queue.settle(shown?.id ?? 0, true);
    await expect(first).resolves.toBe(true);

    const second = queue.show(confirm);
    queue.settle(queue.current()?.id ?? 0, false);
    await expect(second).resolves.toBe(false);
  });

  it('shows one dialog at a time, the next once the first ends', async () => {
    const queue = createDialogQueue();
    queue.attach();
    const notice: DialogSpec = { kind: 'notice', title: 'The trip is full', ok: 'Got it' };
    const first = queue.show(confirm);
    const second = queue.show(notice);
    expect(queue.current()?.spec).toBe(confirm);
    // A settle for a dialog that is not on screen changes nothing.
    queue.settle(999, true);
    expect(queue.current()?.spec).toBe(confirm);
    queue.settle(queue.current()?.id ?? 0, false);
    expect(queue.current()?.spec).toBe(notice);
    queue.settle(queue.current()?.id ?? 0, true);
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
    expect(queue.current()).toBeNull();
  });

  it('ends what waits as its way back when the last host goes', async () => {
    const queue = createDialogQueue();
    const detach = queue.attach();
    const waiting = queue.show(confirm);
    detach();
    await expect(waiting).resolves.toBe(false);
    expect(queue.current()).toBeNull();
    expect(queue.show(confirm)).toBeNull();
  });
});
