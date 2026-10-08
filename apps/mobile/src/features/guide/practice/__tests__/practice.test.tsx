/**
 * Phrase practice: an attempt is graded by the feedback route and recorded with its verdict and
 * score, a miss shows what was heard with the guide's tip, a practice that went well moves the
 * phrase to "learned", "I said it" counts without listening, and an attempt nothing could grade
 * is not recorded at all.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';

import { renderScreen } from '../../voice/test-support/screen-harness';
import { PRACTICE_SCENES, PRACTICE_PHRASES } from '../dev/lab-scenes-practice';
import {
  createPracticeController,
  type PracticeGrade,
  type PracticePorts,
  type PracticeRecord,
} from '../practice-controller';
import {
  currentPhrase,
  practiceLists,
  PRACTICE_READY,
  type PracticePhrase,
  type PracticeState,
} from '../practice-model';
import { PracticeView } from '../practice-view';

const THANKS = PRACTICE_PHRASES[0] as PracticePhrase;

function harness(overrides: Partial<PracticePorts> = {}, heard = 'Cảm ơn nhiều') {
  const states: PracticeState[] = [];
  const records: PracticeRecord[] = [];
  const cancel = jest.fn(() => Promise.resolve());
  const grade = jest.fn((): Promise<PracticeGrade> =>
    Promise.resolve({ outcome: 'ok', score: 100, tip: null }),
  );
  const ports: PracticePorts = {
    allowMicrophone: () => Promise.resolve(true),
    listen: (_language, onPartial) => {
      onPartial('Cảm');
      return Promise.resolve({ stop: () => Promise.resolve(heard), cancel });
    },
    online: () => true,
    grade,
    record: (record) => records.push(record),
    ...overrides,
  };
  const controller = createPracticeController(ports, (state) => states.push(state));
  return { controller, states, records, grade, cancel };
}

describe('an attempt with the check on', () => {
  it('listens in the phrase language, grades what was heard and records the verdict', async () => {
    const listen = jest.fn<NonNullable<PracticePorts['listen']>>((_language, onPartial) => {
      onPartial('Cảm ơn');
      return Promise.resolve({
        stop: () => Promise.resolve(' Cảm ơn nhiều '),
        cancel: () => Promise.resolve(),
      });
    });
    const { controller, states, records, grade } = harness({ listen });
    await controller.listen(THANKS);
    expect(listen.mock.calls[0]?.[0]).toBe('vi');
    expect(controller.state).toMatchObject({ phase: 'listening', heard: 'Cảm ơn' });
    await controller.check(THANKS);
    expect(grade).toHaveBeenCalledWith(THANKS, 'Cảm ơn nhiều');
    expect(states.map((state) => state.phase)).toEqual([
      'listening',
      'listening',
      'checking',
      'ok',
    ]);
    expect(records).toEqual([{ phrase_id: 'thanks', language: 'vi', outcome: 'ok', score: 100 }]);
  });

  it('keeps what was heard and the tip on a miss, and records the miss', async () => {
    const { controller, records } = harness(
      {
        grade: () => Promise.resolve({ outcome: 'retry', score: 50, tip: 'Lift the last word.' }),
      },
      'Cam on nhiu',
    );
    await controller.listen(THANKS);
    await controller.check(THANKS);
    expect(controller.state).toEqual({
      phase: 'retry',
      heard: 'Cam on nhiu',
      tip: 'Lift the last word.',
      issue: null,
    });
    expect(records).toEqual([{ phrase_id: 'thanks', language: 'vi', outcome: 'retry', score: 50 }]);
  });

  it('records nothing when the attempt could not be graded, was silent, or never started', async () => {
    const failing = harness({ grade: () => Promise.reject(new Error('unreachable')) });
    await failing.controller.listen(THANKS);
    await failing.controller.check(THANKS);
    expect(failing.controller.state).toMatchObject({ phase: 'ready', issue: 'check_failed' });
    expect(failing.records).toEqual([]);

    const silent = harness({}, '   ');
    await silent.controller.listen(THANKS);
    await silent.controller.check(THANKS);
    expect(silent.controller.state.issue).toBe('heard_nothing');
    expect(silent.grade).not.toHaveBeenCalled();
    expect(silent.records).toEqual([]);

    const offline = harness({ online: () => false });
    await offline.controller.listen(THANKS);
    expect(offline.controller.state).toMatchObject({ phase: 'ready', issue: 'offline' });

    const refused = harness({ allowMicrophone: () => Promise.resolve(false) });
    await refused.controller.listen(THANKS);
    expect(refused.controller.state.issue).toBe('mic_denied');

    const noModule = harness({ listen: null });
    await noModule.controller.listen(THANKS);
    expect(noModule.controller.state.issue).toBe('no_speech_module');
  });

  it('drops the attempt when another phrase is picked while listening', async () => {
    const { controller, cancel, records } = harness();
    await controller.listen(THANKS);
    controller.reset();
    expect(cancel).toHaveBeenCalledTimes(1);
    await controller.check(THANKS);
    expect(controller.state).toEqual(PRACTICE_READY);
    expect(records).toEqual([]);
  });
});

describe('"I said it"', () => {
  it('counts the practice without listening or grading', () => {
    const { controller, records, grade } = harness();
    controller.said(THANKS);
    expect(controller.state.phase).toBe('ok');
    expect(grade).not.toHaveBeenCalled();
    expect(records).toEqual([{ phrase_id: 'thanks', language: 'vi', outcome: 'ok' }]);
  });
});

describe('the lists', () => {
  it('moves a learned phrase out of practising and offers the next one', () => {
    const lists = practiceLists(PRACTICE_PHRASES, new Set(['thanks', 'hello']));
    expect(lists.practising.map((phrase) => phrase.id)).toEqual(['bill', 'peanuts', 'where']);
    expect(lists.learned.map((phrase) => phrase.id)).toEqual(['thanks', 'hello']);
    expect(currentPhrase(PRACTICE_PHRASES, lists, null)?.id).toBe('bill');
    // A picked phrase stays, learned or not.
    expect(currentPhrase(PRACTICE_PHRASES, lists, 'hello')?.id).toBe('hello');
  });
});

describe('what the screen shows', () => {
  const scene = (name: string) => (PRACTICE_SCENES[name] as () => React.ReactElement)();

  it('shows what was heard with the tip on a miss, and offers another go', async () => {
    await renderScreen(scene('practice-tip'));
    expect(screen.getByTestId('guide-practice-heard').props.children).toBe('"Cam on nhiu"');
    expect(screen.getByTestId('guide-practice-tip').props.children).toContain('nhiều');
    expect(screen.getByTestId('guide-practice-say')).toBeTruthy();
    expect(screen.queryByTestId('guide-practice-ok')).toBeNull();
    expect(screen.queryByTestId('guide-practice-next')).toBeNull();
  });

  it('shows the pass, the count and the next phrase once it went well', async () => {
    await renderScreen(scene('practice-ok'));
    expect(screen.getByTestId('guide-practice-ok')).toBeTruthy();
    expect(screen.getByTestId('guide-practice-count').props.children).toBe('2 of 5 learned');
    expect(screen.getByTestId('guide-practice-next')).toBeTruthy();
    expect(screen.queryByTestId('guide-practice-tip')).toBeNull();
  });

  it('offers only "I said it" until the check is on and the voice consent stands', async () => {
    const onSaid = jest.fn();
    const onAgree = jest.fn();
    const view = (checking: boolean, consent: boolean) => (
      <PracticeView
        guideName="Ngựa"
        lists={practiceLists(PRACTICE_PHRASES, new Set())}
        current={THANKS}
        card={null}
        state={PRACTICE_READY}
        checking={checking}
        consent={consent ? { onAgree, onNotNow: () => undefined } : null}
        onChecking={() => undefined}
        onPick={() => undefined}
        onListen={() => undefined}
        onCheck={() => undefined}
        onSaid={onSaid}
        onNext={() => undefined}
      />
    );
    const shown = await renderScreen(view(false, false));
    expect(screen.queryByTestId('guide-practice-say')).toBeNull();
    await fireEvent.press(screen.getByTestId('guide-practice-said'));
    expect(onSaid).toHaveBeenCalledTimes(1);

    await shown.rerender(view(true, true));
    expect(screen.queryByTestId('guide-practice-say')).toBeNull();
    await fireEvent.press(screen.getByTestId('guide-practice-consent-yes'));
    expect(onAgree).toHaveBeenCalledTimes(1);
  });
});
