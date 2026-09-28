/**
 * Counts app opens by local hour for the nudge send time (`record_app_open`): once when Home mounts
 * and on every return to the foreground, at most once per local hour from this device. The server
 * throttles as well; this only saves the queue the no-op ops.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useCommand } from '@/data/commands/use-command';

import { recordAppOpenCommand } from '../home-commands';

const HOUR = 60 * 60 * 1000;

/** The key of the hour an open falls in; a repeat inside the same hour is skipped. */
export function hourKey(at: Date): string {
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}-${at.getHours()}`;
}

const systemNow = (): Date => new Date();

export function useRecordAppOpen(now: () => Date = systemNow): void {
  const { send } = useCommand(recordAppOpenCommand);
  const lastKey = useRef<string | null>(null);
  const lastAt = useRef(0);
  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  }, [now]);

  useEffect(() => {
    const record = () => {
      const at = nowRef.current();
      const key = hourKey(at);
      if (key === lastKey.current && at.getTime() - lastAt.current < HOUR) return;
      lastKey.current = key;
      lastAt.current = at.getTime();
      void send({ hour_local: at.getHours() });
    };
    record();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') record();
    });
    return () => subscription.remove();
  }, [send]);
}
