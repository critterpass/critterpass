import { isProvisionalSave, takesBackSave, type QueuedCommand } from '../provisional-idea';

jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));

const IDEA = '01a2b3c4-0000-7000-8000-00000000aaaa';
const PLACE = '01a2b3c4-0000-7000-8000-00000000bbbb';

const queued = (cmd: string, payload: Record<string, unknown>): QueuedCommand => ({
  cmd,
  envelope: JSON.stringify({ cmd, payload }),
});
const ownSave = queued('save_idea', { idea_id: IDEA, poi_id: PLACE, source: 'search' });
const decide = (over: Partial<Parameters<typeof takesBackSave>[0]>) =>
  takesBackSave({ createdByThisAdd: true, ideaId: IDEA, sawChoice: false, queued: [], ...over });

describe('a save made only so Add to plan could open', () => {
  it('is taken back when she backs out without choosing anything', () => {
    expect(decide({})).toBe(true);
    // The save itself still waiting in the queue is not a choice.
    expect(decide({ queued: [ownSave] })).toBe(true);
  });

  it('stays when she added the place to a day', () => {
    const add = queued('edit_plan', { ops: [{ op: 'add_item', poi_id: PLACE, idea_id: IDEA }] });
    expect(decide({ queued: [ownSave, add] })).toBe(false);
  });

  it('stays when she tapped "Just save it for later"', () => {
    const later = queued('save_idea', { idea_id: IDEA, poi_id: PLACE, source: 'save' });
    expect(decide({ queued: [later] })).toBe(false);
  });

  it('stays when she swiped or hearted the place, before or on the way', () => {
    expect(decide({ queued: [queued('swipe_vote', { place_id: PLACE, verdict: 'yes' })] })).toBe(
      false,
    );
    const heart = queued('save_idea', { idea_id: 'another-idea', poi_id: PLACE, source: 'save' });
    expect(decide({ queued: [ownSave, heart] })).toBe(false);
  });

  it('stays when a choice was seen while the sheet was open, though the queue has emptied', () => {
    expect(decide({ sawChoice: true })).toBe(false);
  });

  it('is never taken back when the place was in Ideas before the + was tapped', () => {
    expect(decide({ createdByThisAdd: false })).toBe(false);
    expect(decide({ createdByThisAdd: false, queued: [ownSave] })).toBe(false);
  });

  it('knows its own save from any other save of the place', () => {
    expect(isProvisionalSave(ownSave, IDEA)).toBe(true);
    expect(isProvisionalSave(ownSave, 'another-idea')).toBe(false);
    expect(isProvisionalSave({ cmd: 'save_idea', envelope: 'not json' }, IDEA)).toBe(false);
    expect(isProvisionalSave(queued('remove_idea', { idea_id: IDEA }), IDEA)).toBe(false);
  });
});
